export type CsvRow = string[];

const cleanLineBreaks = (text: string): string => text.replace(/\r\n/g, "\n");

const detectDelimiter = (text: string): "," | "\t" => {
  const normalized = cleanLineBreaks(text);
  const firstNonEmptyLine = normalized
    .split("\n")
    .find((line) => line.trim().length > 0);

  if (!firstNonEmptyLine) {
    return ",";
  }

  let inQuotes = false;
  let commaCount = 0;
  let tabCount = 0;

  for (const char of Array.from(firstNonEmptyLine)) {
    if (char === "\"") {
      inQuotes = !inQuotes;
      continue;
    }
    if (inQuotes) {
      continue;
    }
    if (char === ",") {
      commaCount += 1;
    } else if (char === "\t") {
      tabCount += 1;
    }
  }

  return tabCount > commaCount ? "\t" : ",";
};

export const parseCsv = (text: string): CsvRow[] => {
  const rows: CsvRow[] = [];
  let currentRow: string[] = [];
  let currentCell = "";
  let inQuotes = false;
  const delimiter = detectDelimiter(text);

  const pushCell = () => {
    currentRow.push(currentCell.trim());
    currentCell = "";
  };

  const pushRow = () => {
    if (currentRow.length > 0 || currentCell.trim().length > 0) {
      pushCell();
      rows.push(currentRow);
    } else if (currentCell.trim().length > 0) {
      rows.push([currentCell.trim()]);
      currentCell = "";
    }
    currentRow = [];
  };

  const characters = Array.from(cleanLineBreaks(text));
  for (let i = 0; i < characters.length; i += 1) {
    const char = characters[i];
    if (char === "\"") {
      if (inQuotes && characters[i + 1] === "\"") {
        currentCell += "\"";
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      pushCell();
    } else if (char === "\n" && !inQuotes) {
      pushRow();
    } else {
      currentCell += char;
    }
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    pushCell();
    rows.push(currentRow);
  }

  return rows;
};

export const trimEmptyRows = (rows: CsvRow[]): CsvRow[] =>
  rows.filter((row) => row.some((cell) => cell.trim().length > 0));
