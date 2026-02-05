const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

let auth = null;

function getSheets() {
  if (!auth) {
    const keyfile = process.env.GOOGLE_SERVICE_ACCOUNT_KEYFILE;
    if (!keyfile || !fs.existsSync(keyfile)) return null;
    auth = new google.auth.GoogleAuth({
      keyFile: keyfile,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
  }
  return google.sheets({ version: 'v4', auth });
}

/**
 * Create a new spreadsheet for an org. Returns spreadsheetId.
 */
async function createSheetForOrg(orgName) {
  const sheets = getSheets();
  if (!sheets) throw new Error('Google Sheets not configured');
  const res = await sheets.spreadsheets.create({
    requestBody: {
      properties: { title: `Treasury Receipts - ${orgName}` },
      sheets: [{ properties: { title: 'Receipts' } }],
    },
  });
  const spreadsheetId = res.data.spreadsheetId;
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: 'Receipts!A1:E1',
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [['Date', 'Description', 'Amount', 'Status', 'Image']] },
  });
  return spreadsheetId;
}

/**
 * Append a receipt row. Image cell uses =IMAGE("presigned_url"). Presigned URLs expire; admins should be aware.
 */
async function appendReceiptRow(spreadsheetId, receipt) {
  const sheets = getSheets();
  if (!sheets) throw new Error('Google Sheets not configured');
  const imageFormula = receipt.photo_url
    ? `=IMAGE("${receipt.photo_url}")`
    : '';
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: 'Receipts!A:E',
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[
        receipt.created_at || new Date().toISOString(),
        receipt.description || '',
        receipt.amount != null ? String(receipt.amount) : '',
        receipt.status || 'pending',
        imageFormula,
      ]],
    },
  });
}

/**
 * Update a row by 1-based row number.
 */
async function updateReceiptRowByRowNumber(spreadsheetId, rowNumber, receipt) {
  const sheets = getSheets();
  if (!sheets) throw new Error('Google Sheets not configured');
  const imageFormula = receipt.photo_url
    ? `=IMAGE("${receipt.photo_url}")`
    : '';
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `Receipts!A${rowNumber}:E${rowNumber}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[
        receipt.created_at || '',
        receipt.description || '',
        receipt.amount != null ? String(receipt.amount) : '',
        receipt.status || 'pending',
        imageFormula,
      ]],
    },
  });
}

/**
 * Find 1-based row number for a receipt by scanning the sheet (e.g. by receipt id in a hidden column or by matching description/amount/date).
 * Our sheet has Date, Description, Amount, Status, Image. We don't store receipt_id in sheet; so we match by (description, amount, date) or we need to add a column.
 * For simplicity: assume we track sheet_row_number on the receipt when we append. So we don't need findRowNumberByReceiptId for append flow.
 * For update we use sheet_row_number from DB. If we need to find by receipt id, we'd add a column. Here we expose a helper that reads sheet and finds row by matching first column (date) + second (description) + third (amount) - fragile. Better: store row number on receipt. So this function can be "find row by row number" or "get row count + 1 for next append".
 */
async function findRowNumberByReceiptId(spreadsheetId, receiptId) {
  const sheets = getSheets();
  if (!sheets) return null;
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Receipts!A:E',
  });
  const rows = res.data.values || [];
  // If we had a receipt_id column we'd search. For now return null; callers use receipt.sheet_row_number from DB.
  return null;
}

module.exports = {
  getSheets,
  createSheetForOrg,
  appendReceiptRow,
  updateReceiptRowByRowNumber,
  findRowNumberByReceiptId,
};
