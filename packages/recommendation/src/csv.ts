export type CsvRow = string[];

const cleanLineBreaks = (text: string): string => text.replace(/\r\n/g, "\n");

export const parseCsv = (text: string): CsvRow[] => {
  const rows: CsvRow[] = [];
  let currentRow: string[] = [];
  let currentCell = "";
  let inQuotes = false;

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
    } else if (char === "," && !inQuotes) {
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
