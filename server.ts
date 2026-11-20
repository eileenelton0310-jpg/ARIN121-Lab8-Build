import express from 'express';
import type { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';
import crypto from 'crypto';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isProduction = process.env.NODE_ENV === 'production';
const PORT = parseInt(process.env.PORT || '3000', 10);

interface OptionItem {
  label: 'A' | 'B' | 'C' | 'D';
  text: string;
}

interface QuestionInternal {
  id: number;
  question: string;
  options: OptionItem[];
  correctAnswer: 'A' | 'B' | 'C' | 'D';
  explanation: string;
  sourceReference: string;
}

interface QuizSession {
  id: string;
  notes: string;
  topic: string;
  questions: QuestionInternal[];
  createdAt: number;
}

// In-memory session store (with 2-hour TTL cleanup)
const sessions = new Map<string, QuizSession>();

setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sessions.entries()) {
    if (now - session.createdAt > 2 * 60 * 60 * 1000) {
      sessions.delete(id);
    }
  }
}, 15 * 60 * 1000);

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || '',
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));

  // API 1: Generate Quiz from Study Material
  app.post('/api/quiz/generate', async (req: Request, res: Response): Promise<void> => {
    try {
      const { notes } = req.body;

      if (!notes || typeof notes !== 'string' || notes.trim().length < 15) {
        res.status(400).json({
          error: 'Please provide your study notes or reading material first before generating a quiz.',
        });
        return;
      }

      if (!process.env.GEMINI_API_KEY) {
        res.status(500).json({
          error: 'Gemini API key is not configured. Please ensure GEMINI_API_KEY is available.',
        });
        return;
      }

      const prompt = `Study Material:\n"""\n${notes.trim()}\n"""\n\nGenerate exactly 3 multiple-choice practice questions strictly based on the study material provided above.`;

      const systemInstruction = `You are a university practice quiz assistant.
Your instructions:
1. Source Constraints: Base questions, correct answers, and explanations strictly on the study material supplied by the user. Do NOT invent facts or use outside knowledge not supported by the text.
2. Create exactly three multiple-choice questions numbered 1, 2, and 3.
3. For each question, provide exactly four distinct options labeled A, B, C, and D.
4. Ensure there is only one clearly correct answer per question according to the supplied material.
5. Provide a short, helpful explanation based on the text explaining why the correct choice is accurate and citing relevant phrasing or concepts from the source material.
6. Provide a concise topic label for the quiz based on the text.`;

      const responseSchema = {
        type: Type.OBJECT,
        properties: {
          topic: {
            type: Type.STRING,
            description: 'Concise subject or topic summary of the study material',
          },
          questions: {
            type: Type.ARRAY,
            description: 'List of exactly three multiple choice questions',
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.INTEGER, description: 'Question number: 1, 2, or 3' },
                question: { type: Type.STRING, description: 'The question text' },
                options: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      label: { type: Type.STRING, description: 'Option letter: A, B, C, or D' },
                      text: { type: Type.STRING, description: 'Option text' },
                    },
                    required: ['label', 'text'],
                  },
                },
                correctAnswer: { type: Type.STRING, description: 'Correct choice label: A, B, C, or D' },
                explanation: { type: Type.STRING, description: 'Short, helpful explanation based on the text' },
                sourceReference: { type: Type.STRING, description: 'Direct quote or concept from the text' },
              },
              required: ['id', 'question', 'options', 'correctAnswer', 'explanation', 'sourceReference'],
            },
          },
        },
        required: ['topic', 'questions'],
      };

      // Primary: gemini-3.8-flash; fallback: gemini-3.1-flash-lite
      const candidateModels = ['gemini-3.1-flash-lite', 'gemini-3.8-flash'];
      let response: any = null;
      let lastErr: any = null;

      for (const model of candidateModels) {
        try {
          response = await ai.models.generateContent({
            model,
            contents: prompt,
            config: {
              systemInstruction,
              responseMimeType: 'application/json',
              responseSchema,
            },
          });
          if (response?.text) {
            break;
          }
        } catch (err: any) {
          lastErr = err;
          console.warn(`Model ${model} failed, trying candidate fallback:`, err.message);
        }
      }

      if (!response || !response.text) {
        throw lastErr || new Error('All models temporarily unavailable. Please retry in a few moments.');
      }

      const rawText = response.text || '{}';
      const parsed = JSON.parse(rawText);

      if (!parsed.questions || !Array.isArray(parsed.questions) || parsed.questions.length === 0) {
        res.status(502).json({ error: 'Failed to extract 3 questions from the study material. Please try again with more detailed notes.' });
        return;
      }

      // Ensure 3 questions
      const cleanedQuestions: QuestionInternal[] = parsed.questions.slice(0, 3).map((q: any, index: number) => {
        const id = index + 1;
        const validOptions: OptionItem[] = ['A', 'B', 'C', 'D'].map((lbl, oIndex) => {
          const found = (q.options || []).find((opt: any) => opt.label === lbl) || q.options?.[oIndex];
          return {
            label: lbl as 'A' | 'B' | 'C' | 'D',
            text: found ? String(found.text) : `Option ${lbl}`,
          };
        });

        const correctAns = ['A', 'B', 'C', 'D'].includes(q.correctAnswer) ? q.correctAnswer : 'A';

        return {
          id,
          question: String(q.question || `Question ${id}`),
          options: validOptions,
          correctAnswer: correctAns as 'A' | 'B' | 'C' | 'D',
          explanation: String(q.explanation || 'Based on the provided study notes.'),
          sourceReference: String(q.sourceReference || ''),
        };
      });

      const sessionId = crypto.randomUUID();
      sessions.set(sessionId, {
        id: sessionId,
        notes: notes.trim(),
        topic: parsed.topic || 'Practice Quiz',
        questions: cleanedQuestions,
        createdAt: Date.now(),
      });

      // Module 1 constraint:
      // "Present just the questions without showing the answer keys or explanations yet.
      // Tell the student to reply using this format (for example: 1B, 2D, 3A). Stop here and wait for their answers before showing answer keys and explanations."
      // Therefore, do NOT send correctAnswer or explanation to client yet!
      const studentFacingQuestions = cleanedQuestions.map(q => ({
        id: q.id,
        question: q.question,
        options: q.options,
      }));

      res.json({
        sessionId,
        topic: parsed.topic || 'Practice Quiz',
        instruction: 'Reply using this format (for example: 1B, 2D, 3A) or click the choices below.',
        questions: studentFacingQuestions,
      });
    } catch (err: any) {
      console.error('Quiz generation error:', err);
      res.status(500).json({
        error: err.message || 'An error occurred while generating the quiz. Please check your notes and try again.',
      });
    }
  });

  // API 2: Evaluate Answers
  // Module 2 constraints:
  // "Once the student replies with their answers, check against the questions and the study material.
  // Give them a final score out of three, and show which ones they got right or wrong.
  // For wrong answers, provide the correct option with a short, helpful explanation based on the text.
  // If an answer is missing or unclear, ask the student to clarify. Do not make a new quiz unless the user asks for one."
  app.post('/api/quiz/evaluate', async (req: Request, res: Response): Promise<void> => {
    try {
      const { sessionId, answerString, answersMap } = req.body;

      if (!sessionId || !sessions.has(sessionId)) {
        res.status(404).json({
          error: 'Quiz session expired or not found. Please generate a quiz from your notes first.',
        });
        return;
      }

      const session = sessions.get(sessionId)!;
      const parsedAnswers: Record<number, 'A' | 'B' | 'C' | 'D'> = {};

      // Parse answers either from answersMap (e.g. { 1: "B", 2: "D", 3: "A" }) or from answerString (e.g. "1B, 2D, 3A")
      if (answersMap && typeof answersMap === 'object') {
        for (let i = 1; i <= 3; i++) {
          const val = String(answersMap[i] || '').toUpperCase().trim();
          if (['A', 'B', 'C', 'D'].includes(val)) {
            parsedAnswers[i] = val as 'A' | 'B' | 'C' | 'D';
          }
        }
      }

      // If text string provided (e.g., student typed "1B, 2D, 3A" or "1: B, 2: D, 3: A" or "B, D, A")
      if (typeof answerString === 'string' && answerString.trim()) {
        const text = answerString.trim();
        // Match patterns like "1B", "1-B", "1: B", "1 B"
        const regex = /([123])\s*[:=\-]?\s*([A-Da-d])/g;
        let match;
        let matchesFound = 0;
        while ((match = regex.exec(text)) !== null) {
          const qId = parseInt(match[1], 10);
          const choice = match[2].toUpperCase() as 'A' | 'B' | 'C' | 'D';
          parsedAnswers[qId] = choice;
          matchesFound++;
        }

        // If no indexed match, but format like "B, D, A" or "BDA"
        if (matchesFound === 0) {
          const pureChoices = text.replace(/[^A-Da-d]/g, '').toUpperCase().split('');
          if (pureChoices.length >= 1) {
            pureChoices.slice(0, 3).forEach((choice, idx) => {
              if (['A', 'B', 'C', 'D'].includes(choice)) {
                parsedAnswers[idx + 1] = choice as 'A' | 'B' | 'C' | 'D';
              }
            });
          }
        }
      }

      // Check for missing or unclear answers
      const missingQuestions: number[] = [];
      for (let i = 1; i <= 3; i++) {
        if (!parsedAnswers[i]) {
          missingQuestions.push(i);
        }
      }

      if (missingQuestions.length > 0) {
        const missingList = missingQuestions.map(n => `Question ${n}`).join(', ');
        res.status(200).json({
          status: 'clarification_required',
          missingQuestions,
          message: `Your answer for ${missingList} is missing or unclear. Please select or clarify your answer for each question (format: 1B, 2D, 3A).`,
        });
        return;
      }

      // Calculate score and review
      let score = 0;
      const results = session.questions.map(q => {
        const studentChoice = parsedAnswers[q.id];
        const isCorrect = studentChoice === q.correctAnswer;
        if (isCorrect) score += 1;

        return {
          id: q.id,
          question: q.question,
          options: q.options,
          studentChoice,
          correctAnswer: q.correctAnswer,
          isCorrect,
          explanation: q.explanation,
          sourceReference: q.sourceReference,
        };
      });

      const formattedAnswerString = `1${parsedAnswers[1]}, 2${parsedAnswers[2]}, 3${parsedAnswers[3]}`;

      res.json({
        status: 'evaluated',
        score,
        total: 3,
        percentage: Math.round((score / 3) * 100),
        formattedAnswerString,
        results,
        feedback:
          score === 3
            ? 'Outstanding! You answered all three questions correctly based on your study material.'
            : score === 2
            ? 'Good work! You got 2 out of 3 correct. Review the explanation below to master the topic.'
            : score === 1
            ? 'You scored 1 out of 3. Review the explanations grounded in your notes to strengthen your understanding.'
            : 'You scored 0 out of 3. Take a close look at the detailed explanations and source quotes below to reinforce your knowledge.',
      });
    } catch (err: any) {
      console.error('Answer evaluation error:', err);
      res.status(500).json({
        error: err.message || 'An error occurred while evaluating your answers.',
      });
    }
  });

  // Mount Vite middleware in dev or static files in production
  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  const port = Number(process.env.PORT) || 3000;
  app.listen(port, '0.0.0.0', () => {
    console.log(`Server running on port ${port}`);
  });
}

startServer();

