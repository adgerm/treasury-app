const { z } = require('zod');

const createReceiptSchema = z.object({
  description: z.string().min(1).max(1000),
  amount: z.number().positive().finite(),
});

function validateCreateReceipt(body) {
  return createReceiptSchema.safeParse(body);
}

const updateReceiptSchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected']).optional(),
  description: z.string().min(1).max(1000).optional(),
  amount: z.number().positive().finite().optional(),
});

function validateUpdateReceipt(body) {
  return updateReceiptSchema.safeParse(body);
}

module.exports = { validateCreateReceipt, validateUpdateReceipt, createReceiptSchema, updateReceiptSchema };
