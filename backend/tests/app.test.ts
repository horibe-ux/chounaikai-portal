import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { AddressInfo } from "node:net";
import { app } from "../src/index";
import { getMemberById, getMemberByToken } from "../src/db";

let server: ReturnType<typeof app.listen>;
let baseUrl = "";
let originalGeminiApiKey: string | undefined;

before(async () => {
  originalGeminiApiKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "";

  server = app.listen(0);

  await new Promise<void>((resolve) => {
    server.once("listening", () => resolve());
  });

  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  process.env.GEMINI_API_KEY = originalGeminiApiKey;

  await new Promise<void>((resolve, reject) => {
    server.close((err) => {
      if (err) {
        reject(err);
        return;
      }

      resolve();
    });
  });
});

test("health endpoint returns ok", async () => {
  const response = await fetch(`${baseUrl}/api/health`);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "ok" });
});

test("seeded member can be looked up by token and id", () => {
  const memberByToken = getMemberByToken("tk8fJ3nQ2xLp");
  const memberById = getMemberById("A-001");

  assert.ok(memberByToken);
  assert.ok(memberById);
  assert.equal(memberByToken?.id, "A-001");
  assert.equal(memberById?.name, "田中 太郎");
});

test("login endpoint returns a safe member payload and session token", async () => {
  const response = await fetch(`${baseUrl}/api/login?token=tk8fJ3nQ2xLp`);
  const body = (await response.json()) as {
    success: true;
    member: Record<string, unknown>;
    sessionToken: string;
  };

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.member.id, "A-001");
  assert.equal(body.member.name, "田中 太郎");
  assert.equal(body.sessionToken.length > 0, true);
  assert.equal("token" in body.member, false);
});

test("me endpoint restores session from login token", async () => {
  const loginResponse = await fetch(`${baseUrl}/api/login?token=tk8fJ3nQ2xLp`);
  const loginBody = (await loginResponse.json()) as { sessionToken: string };

  const meResponse = await fetch(`${baseUrl}/api/me`, {
    headers: {
      Authorization: `Bearer ${loginBody.sessionToken}`,
    },
  });

  const meBody = (await meResponse.json()) as {
    success: true;
    member: Record<string, unknown>;
  };

  assert.equal(meResponse.status, 200);
  assert.equal(meBody.success, true);
  assert.equal(meBody.member.id, "A-001");
  assert.equal("token" in meBody.member, false);
});

test("circulars endpoint filters by association and attaches 3-line summaries", async () => {
  const response = await fetch(
    `${baseUrl}/api/circulars?association=${encodeURIComponent("中央三丁目自治会")}`
  );

  const body = (await response.json()) as {
    success: true;
    circulars: Array<{
      id: string;
      neighborhood_association: string;
      summary: string[];
    }>;
  };

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.circulars.length, 2);
  assert.equal(
    body.circulars.every(
      (circular) => circular.neighborhood_association === "中央三丁目自治会"
    ),
    true
  );
  assert.equal(body.circulars.every((circular) => circular.summary.length === 3), true);
  assert.equal(
    body.circulars.every((circular) => circular.summary.every((line) => line.length <= 30)),
    true
  );
});