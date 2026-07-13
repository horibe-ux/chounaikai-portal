import fs from "fs";
import path from "path";
import {
  summarizeCircularContentDetailed,
  SummaryDiagnostics,
  SummarySource,
} from "./gemini";

export type CircularSeed = {
  id: string;
  neighborhood_association: string;
  title: string;
  content: string;
};

export type Circular = CircularSeed & {
  summary: string[];
  source: SummarySource;
  diagnostics: SummaryDiagnostics;
};

const CIRCULARS_PATH = path.join(__dirname, "..", "data", "circulars.json");

let cachedCirculars: CircularSeed[] | null = null;

function loadCircularSeeds(): CircularSeed[] {
  if (cachedCirculars) {
    return cachedCirculars;
  }

  const raw = fs.readFileSync(CIRCULARS_PATH, "utf-8");
  cachedCirculars = JSON.parse(raw) as CircularSeed[];
  return cachedCirculars;
}

export function getCircularsByAssociation(association: string): CircularSeed[] {
  const normalizedAssociation = association.trim();

  return loadCircularSeeds().filter(
    (circular) => circular.neighborhood_association === normalizedAssociation
  );
}

export function getAllCirculars(): CircularSeed[] {
  return loadCircularSeeds();
}

export function buildCircularsContext(circulars: CircularSeed[]): string {
  if (circulars.length === 0) {
    return "回覧板データはありません。";
  }

  return circulars
    .map(
      (circular) =>
        `ID:${circular.id}\n自治会:${circular.neighborhood_association}\n件名:${circular.title}\n本文:${circular.content}`
    )
    .join("\n\n---\n\n");
}

export async function getCircularsWithSummaryByAssociation(
  association: string
): Promise<Circular[]> {
  const filteredCirculars = getCircularsByAssociation(association);

  return Promise.all(
    filteredCirculars.map(async (circular) => {
      const summaryResult = await summarizeCircularContentDetailed(circular.content);

      return {
        ...circular,
        summary: summaryResult.summary,
        source: summaryResult.source,
        diagnostics: summaryResult.diagnostics,
      };
    })
  );
}
