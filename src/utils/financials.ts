import type { FinancialDetails } from '../types';

export const getEffectiveFinancials = (financials?: FinancialDetails) => {
  if (!financials) {
    return { amount: 0, dueDate: 'N/A', paymentStatus: 'Unpaid' as const };
  }
  
  const installments = financials.installments;
  if (!installments || installments.length === 0) {
    return {
      amount: financials.amount || 0,
      dueDate: financials.dueDate || 'N/A',
      paymentStatus: (financials.paymentStatus || 'Unpaid') as 'Paid' | 'Unpaid' | 'Pending'
    };
  }

  // Get current date string in local YYYY-MM-DD
  const local = new Date();
  const offset = local.getTimezoneOffset();
  const adjustedDate = new Date(local.getTime() - (offset * 60 * 1000));
  const todayStr = adjustedDate.toISOString().split('T')[0];

  // Sort installments chronologically
  const sorted = [...installments].sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  // Find the first unpaid/pending installment
  const firstUnpaid = sorted.find(inst => inst.paymentStatus !== 'Paid');

  if (!firstUnpaid) {
    // All installments are Paid
    return {
      amount: 0,
      dueDate: 'Fully Paid',
      paymentStatus: 'Paid' as const
    };
  }

  // If today's date is before the due date of the first unpaid installment,
  // then the status is "Paid" (renewing only when the due date passes)
  if (todayStr < firstUnpaid.dueDate) {
    return {
      amount: firstUnpaid.amount,
      dueDate: firstUnpaid.dueDate,
      paymentStatus: 'Paid' as const
    };
  } else {
    return {
      amount: firstUnpaid.amount,
      dueDate: firstUnpaid.dueDate,
      paymentStatus: firstUnpaid.paymentStatus
    };
  }
};
