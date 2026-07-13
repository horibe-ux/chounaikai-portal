import fs from "fs";
import path from "path";
import QRCode from "qrcode";
import dotenv from "dotenv";
import { getAllMembers } from "../src/db";

dotenv.config();

const FRONTEND_BASE_URL =
  process.env.FRONTEND_BASE_URL || "http://localhost:5173";

const OUTPUT_DIR = path.join(__dirname, "..", "qrcodes");

async function main() {
  const members = getAllMembers();

  if (members.length === 0) {
    console.log(
      "名簿データが空です。先にバックエンドを一度起動してDBを初期化してください（npm run dev）。"
    );
    return;
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const cards: { member: (typeof members)[number]; fileName: string }[] = [];

  for (const member of members) {
    const loginUrl = `${FRONTEND_BASE_URL}/?token=${encodeURIComponent(
      member.token
    )}`;
    const fileName = `${member.id}.png`;
    const filePath = path.join(OUTPUT_DIR, fileName);

    await QRCode.toFile(filePath, loginUrl, {
      width: 400,
      margin: 2,
    });

    console.log(`[qrcode] ${member.id} (${member.name}) -> ${fileName}`);
    cards.push({ member, fileName });
  }

  const galleryPath = path.join(OUTPUT_DIR, "index.html");
  fs.writeFileSync(galleryPath, buildGalleryHtml(cards));

  console.log(`\n合計 ${members.length} 件のQRコードを生成しました。`);
  console.log(`出力先: ${OUTPUT_DIR}`);
  console.log(`印刷用ページ: ${galleryPath}`);
}

function buildGalleryHtml(
  cards: { member: ReturnType<typeof getAllMembers>[number]; fileName: string }[]
): string {
  const cardHtml = cards
    .map(
      ({ member, fileName }) => `
      <section class="card">
        <img src="${fileName}" alt="QRコード: ${member.name}" />
        <h2>${member.name} 様</h2>
        <p class="assoc">${member.neighborhood_association}</p>
        <p class="sub">世帯ID: ${member.id}</p>
      </section>`
    )
    .join("\n");

  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="UTF-8" />
<title>町内会 QRコード一覧（印刷用）</title>
<style>
  body {
    font-family: "Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif;
    background: #f8fafc;
    margin: 0;
    padding: 24px;
  }
  h1 {
    text-align: center;
    margin-bottom: 24px;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 20px;
  }
  .card {
    background: white;
    border: 1px solid #e2e8f0;
    border-radius: 16px;
    padding: 20px;
    text-align: center;
    page-break-inside: avoid;
  }
  .card img {
    width: 100%;
    max-width: 220px;
  }
  .card h2 {
    margin: 8px 0 4px;
    font-size: 18px;
  }
  .assoc {
    color: #2563eb;
    font-weight: bold;
    margin: 0;
  }
  .sub {
    color: #64748b;
    font-size: 13px;
    margin: 4px 0 0;
  }
  @media print {
    body { background: white; }
    .card { break-inside: avoid; }
  }
</style>
</head>
<body>
  <h1>町内会ポータル ログイン用QRコード一覧</h1>
  <div class="grid">
    ${cardHtml}
  </div>
</body>
</html>
`;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
