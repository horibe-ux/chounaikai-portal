import express, { Request, Response } from "express";
import cors from "cors";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import fs from "fs";
import path from "path";
import { getMemberByToken, getMemberById, Member } from "./db";
import {
  buildCircularsContext,
  getAllCirculars,
  getCircularsWithSummaryByAssociation,
} from "./circulars";
import { askAiViceChair } from "./gemini";

dotenv.config();

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const SESSION_EXPIRES_IN = "180d"; // 高齢者向け: 一度QRログインしたら長期間再ログイン不要にする

export function createApp() {
  const app = express();
  const frontendDistPath = path.resolve(__dirname, "../../frontend/dist");
  const frontendIndexPath = path.join(frontendDistPath, "index.html");

  app.use(cors());
  app.use(express.json());

  function toSafeMember(member: Member) {
    const { token: _omit, ...safeMember } = member;
    return safeMember;
  }

  function issueSessionToken(member: Member): string {
    return jwt.sign({ sub: member.id }, JWT_SECRET, {
      expiresIn: SESSION_EXPIRES_IN,
    });
  }

  // ヘルスチェック
  app.get("/api/health", (_req: Request, res: Response) => {
    res.json({ status: "ok" });
  });

  // QRログイン用API
  // GET /api/login?token=xxxx  （tokenはQRコードに埋め込まれた世帯識別トークン）
  app.get("/api/login", (req: Request, res: Response) => {
    const token = req.query.token;

    if (!token || typeof token !== "string") {
      return res.status(400).json({
        success: false,
        message: "トークンが指定されていません。",
      });
    }

    try {
      const member = getMemberByToken(token);

      if (!member) {
        return res.status(401).json({
          success: false,
          message: "トークンが無効です。QRコードを確認してください。",
        });
      }

      const sessionToken = issueSessionToken(member);

      return res.status(200).json({
        success: true,
        member: toSafeMember(member),
        sessionToken,
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({
        success: false,
        message: "サーバーエラーが発生しました。",
      });
    }
  });

  // セッション確認用API（ログイン状態の継続）
  // GET /api/me  （Authorization: Bearer <sessionToken>）
  app.get("/api/me", (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    const sessionToken = authHeader?.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length)
      : undefined;

    if (!sessionToken) {
      return res.status(401).json({
        success: false,
        message: "ログイン情報がありません。",
      });
    }

    try {
      const payload = jwt.verify(sessionToken, JWT_SECRET) as { sub: string };
      const member = getMemberById(payload.sub);

      if (!member) {
        return res.status(401).json({
          success: false,
          message: "ログイン情報が見つかりません。",
        });
      }

      return res.status(200).json({
        success: true,
        member: toSafeMember(member),
      });
    } catch (err) {
      return res.status(401).json({
        success: false,
        message: "ログイン情報の有効期限が切れています。もう一度QRコードを読み取ってください。",
      });
    }
  });

  app.get("/api/circulars", async (req: Request, res: Response) => {
    const association = req.query.association;

    if (!association || typeof association !== "string") {
      return res.status(400).json({
        success: false,
        message: "自治会名が指定されていません。",
      });
    }

    try {
      const circulars = await getCircularsWithSummaryByAssociation(association);

      return res.status(200).json({
        success: true,
        circulars,
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({
        success: false,
        message: "回覧板を取得できませんでした。",
      });
    }
  });

  app.post("/api/ask-ai", async (req: Request, res: Response) => {
    const question = req.body?.question;

    if (!question || typeof question !== "string" || !question.trim()) {
      return res.status(400).json({
        success: false,
        message: "質問を入力してください。",
      });
    }

    try {
      const circularsContext = buildCircularsContext(getAllCirculars());
      const result = await askAiViceChair(question.trim(), circularsContext);

      return res.status(200).json({
        success: true,
        answer: result.answer,
        source: result.source,
        diagnostics: result.diagnostics,
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({
        success: false,
        message: "AI副会長からの回答を取得できませんでした。",
      });
    }
  });

  if (fs.existsSync(frontendIndexPath)) {
    app.use(express.static(frontendDistPath));

    // API以外のGETはSPAのエントリを返す
    app.get(/^(?!\/api).*/, (_req: Request, res: Response) => {
      return res.sendFile(frontendIndexPath);
    });
  }

  return app;
}

export const app = createApp();

export function startServer(port: number = PORT) {
  return app.listen(port, () => {
    console.log(`[backend] Server running at http://localhost:${port}`);
  });
}

if (require.main === module) {
  startServer();
}
