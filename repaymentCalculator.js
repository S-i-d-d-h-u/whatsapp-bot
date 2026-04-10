// repaymentCalculator.js  — Standalone repayment calculator (root level)
export const LOAN_AMOUNT = 25_000;
const ceilDiv = (a, b) => Math.ceil(a / b);
const inr     = (n)    => `₹${Number(n).toLocaleString('en-IN')}`;

export function calculateMonthly(months, loan = LOAN_AMOUNT) {
  if (!Number.isInteger(months) || months <= 0 || months > 60)
    return { valid: false, error: 'Tenure must be 1–60 months.' };
  const emi          = ceilDiv(loan, months);
  const totalPayable = emi * months;
  const overpayment  = totalPayable - loan;
  const schedule     = Array.from({ length: months }, (_, i) => ({
    month:  i + 1,
    amount: i === months - 1 ? emi - overpayment : emi,
  }));
  return { valid: true, plan: 'MONTHLY', loan, months, emi,
           totalPayable, overpayment, schedule };
}

export function calculateSeasonal(highMonths, highPayment, loan = LOAN_AMOUNT, totalMonths = 12) {
  const lowMonths = totalMonths - highMonths;
  if (!Number.isInteger(highMonths) || highMonths < 1 || highMonths > totalMonths - 1)
    return { valid: false, error: `High months must be 1–${totalMonths - 1}.` };
  if (!Number.isInteger(highPayment) || highPayment <= 0)
    return { valid: false, error: 'High payment must be a positive number.' };

  const highTotal = highPayment * highMonths;
  const remaining = loan - highTotal;
  let lowPayment, lowTotal, totalPayable, overpayment, warning;

  if (remaining <= 0) {
    lowPayment = 0; lowTotal = 0; totalPayable = highTotal;
    overpayment = Math.abs(remaining);
    warning = `High payments alone cover the loan. No low-month payment needed. ` +
              `Consider reducing high-period amount to ${inr(Math.floor(loan / highMonths))}.`;
  } else {
    lowPayment   = ceilDiv(remaining, lowMonths);
    lowTotal     = lowPayment * lowMonths;
    totalPayable = highTotal + lowTotal;
    overpayment  = totalPayable - loan;
    warning      = null;
  }

  const schedule = [];
  for (let i = 1; i <= highMonths; i++)
    schedule.push({ month: i, period: 'high', amount: highPayment });
  for (let i = 1; i <= lowMonths; i++) {
    const isLast = i === lowMonths;
    schedule.push({ month: highMonths + i, period: 'low',
                    amount: isLast && overpayment > 0 ? lowPayment - overpayment : lowPayment });
  }

  return { valid: true, plan: 'SEASONAL', loan, totalMonths, highMonths, lowMonths,
           highPayment, lowPayment, highTotal, lowTotal, totalPayable, overpayment, warning, schedule };
}

export function calculateMicro(dailyAmount, desiredMonths, loan = LOAN_AMOUNT, daysPerMonth = 30) {
  if (!Number.isInteger(dailyAmount)    || dailyAmount    <= 0) return { valid: false, error: 'Daily amount must be positive.' };
  if (!Number.isInteger(desiredMonths)  || desiredMonths  <= 0) return { valid: false, error: 'Months must be positive.' };
  if (desiredMonths > 60)                                        return { valid: false, error: 'Maximum 60 months.' };

  const daysInPeriod  = desiredMonths * daysPerMonth;
  const totalViaDaily = dailyAmount * daysInPeriod;
  const sufficient    = totalViaDaily >= loan;
  const shortfall     = Math.max(loan - totalViaDaily, 0);
  const suggestedDaily = ceilDiv(loan, daysInPeriod);
  const daysToRepay   = Math.ceil(loan / dailyAmount);
  const monthsToRepay = parseFloat((daysToRepay / daysPerMonth).toFixed(1));

  return { valid: true, plan: 'MICRO', loan, dailyAmount, desiredMonths, daysInPeriod,
           totalViaDaily, sufficient, shortfall, suggestedDaily, daysToRepay, monthsToRepay };
}
