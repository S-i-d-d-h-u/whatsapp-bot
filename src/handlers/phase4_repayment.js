// src/handlers/phase4_repayment.js  — Phase 4/5: Repayment Plans
import { sendText, sendList, sendButtons }             from '../services/whatsappService.js';
import { setSession, getSession, updateSessionData,
         STATE }                                        from '../utils/sessionManager.js';

const LOAN = 25_000;

// ── Entry: show the 3-plan list menu ──────────────────────────────────────
export async function showRepaymentMenu(from) {
  setSession(from, STATE.REPAYMENT_MENU);
  await sendList(
    from,
    `💳 *Choose Your Repayment Plan*\n\nSelect the plan that best fits your income pattern.`,
    'View Plans',
    [{
      title: 'Repayment Options',
      rows: [
        { id: 'repay_monthly',  title: '📅 Monthly Fixed EMI',    description: 'Pay equal amount every month' },
        { id: 'repay_seasonal', title: '🎪 Seasonal Repayment',   description: 'Pay more during festival months' },
        { id: 'repay_micro',    title: '🪙 Micro Daily Repayment', description: 'Pay small amounts every day' },
      ],
    }],
    'Repayment Setup',
    'Choose the plan that suits your business.'
  );
}

// ── Route list/button selections ───────────────────────────────────────────
export async function handleRepaymentSelection(from, state, buttonId) {

  if (buttonId === 'repay_monthly') {
    setSession(from, STATE.MONTHLY_EMI);
    await sendText(from,
      `📅 *Monthly Fixed EMI Plan*\n\nLoan Amount: *₹${LOAN.toLocaleString('en-IN')}*\n\n` +
      `Please enter your preferred *repayment tenure in months*.\n\n_Options: 3, 6, 9, or 12 months_`
    );
    return;
  }

  if (buttonId === 'repay_seasonal') {
    setSession(from, STATE.SEASONAL_HIGH);
    await sendText(from,
      `🎪 *Seasonal Repayment Plan*\n\n` +
      `This plan lets you pay *more during high-income festival months* and less during slow periods.\n\n` +
      `How many months per year are *high-income* months for your business?\n\n` +
      `_Example: 4 (Diwali, Holi, Eid, Christmas)_\n\nEnter a number between 1 and 11:`
    );
    return;
  }

  if (buttonId === 'repay_micro') {
    setSession(from, STATE.MICRO_DAILY);
    await sendText(from,
      `🪙 *Micro Daily Repayment Plan*\n\n` +
      `Pay a small fixed amount *every day* — ideal for vendors with daily cash income.\n\n` +
      `Loan Amount: *₹${LOAN.toLocaleString('en-IN')}*\n\n` +
      `How much can you pay *per day* (in ₹)?\n\n_Example: 50 or 100_`
    );
    return;
  }

  if (buttonId === 'plan_proceed') {
    const { finalizePlan } = await import('./phase6_finalization.js');
    await finalizePlan(from);
    return;
  }

  if (buttonId === 'plan_change') {
    await showRepaymentMenu(from);
    return;
  }

  if (buttonId === 'plan_change_tenure') {
    setSession(from, STATE.MONTHLY_EMI);
    await sendText(from, `Please enter a new tenure in months (3, 6, 9, or 12):`);
    return;
  }
}

// ── Handle numeric text inputs ─────────────────────────────────────────────
export async function handleRepaymentInput(from, state, text) {
  const num = parseInt(text.trim(), 10);
  if (isNaN(num) || num <= 0) {
    await sendText(from, `⚠️ Please enter a valid number. E.g. *6* for months, or *50* for ₹50/day.`);
    return;
  }

  // ── Monthly EMI ───────────────────────────────────────────────────────────
  if (state === STATE.MONTHLY_EMI) {
    if (![3, 6, 9, 12].includes(num)) {
      await sendText(from, `⚠️ Please choose: *3, 6, 9, or 12* months.`);
      return;
    }
    const emi = Math.ceil(LOAN / num);
    updateSessionData(from, { repaymentPlan: { type: 'MONTHLY', tenure: num, emi } });
    setSession(from, STATE.MONTHLY_CONFIRM);
    await sendButtons(from,
      `📅 *Monthly EMI Plan Summary*\n\n` +
      `• Loan Amount:  ₹${LOAN.toLocaleString('en-IN')}\n` +
      `• Tenure:       ${num} months\n` +
      `• Monthly EMI:  *₹${emi.toLocaleString('en-IN')}*\n\n` +
      `_First payment due 30 days after disbursement._`,
      [
        { id: 'plan_proceed',       title: '✅ Proceed with Plan' },
        { id: 'plan_change_tenure', title: '🔄 Change Tenure'     },
      ]
    );
    return;
  }

  // ── Seasonal: number of high months ───────────────────────────────────────
  if (state === STATE.SEASONAL_HIGH) {
    if (num < 1 || num > 11) {
      await sendText(from, `⚠️ Please enter a number between 1 and 11.`);
      return;
    }
    updateSessionData(from, { repaymentPlan: { type: 'SEASONAL', highMonths: num } });
    setSession(from, STATE.SEASONAL_LOW);
    await sendText(from,
      `How much can you pay per month during your *high-income months*? (in ₹)\n\n_Example: 3000_`
    );
    return;
  }

  // ── Seasonal: high payment amount ─────────────────────────────────────────
  if (state === STATE.SEASONAL_LOW) {
    const { repaymentPlan } = getSession(from).data;
    const highMonths = repaymentPlan.highMonths;
    const lowMonths  = 12 - highMonths;
    const highTotal  = num * highMonths;
    const remaining  = Math.max(LOAN - highTotal, 0);
    const lowEMI     = lowMonths > 0 ? Math.ceil(remaining / lowMonths) : 0;

    updateSessionData(from, {
      repaymentPlan: { ...repaymentPlan, highPayment: num, lowPayment: lowEMI },
    });
    setSession(from, STATE.SEASONAL_CONFIRM);

    const total = num * highMonths + lowEMI * lowMonths;
    const warning = highTotal >= LOAN
      ? `\n⚠️ Your high-period payments alone cover the loan. No low-month payment needed.` : '';

    await sendButtons(from,
      `🎪 *Seasonal Plan Summary*\n\n` +
      `• High months (${highMonths}): ₹${num.toLocaleString('en-IN')}/month\n` +
      `• Low months  (${lowMonths}): ₹${lowEMI.toLocaleString('en-IN')}/month\n` +
      `• Total repaid: ₹${total.toLocaleString('en-IN')}${warning}`,
      [
        { id: 'plan_proceed', title: '✅ Proceed with Plan' },
        { id: 'plan_change',  title: '🔄 Start Over'        },
      ]
    );
    return;
  }

  // ── Micro: daily amount ────────────────────────────────────────────────────
  if (state === STATE.MICRO_DAILY) {
    updateSessionData(from, { repaymentPlan: { type: 'MICRO', dailyAmount: num } });
    setSession(from, STATE.MICRO_TENURE);
    await sendText(from,
      `In how many months would you like to repay the loan?\n\n_Enter a number between 3 and 12:_`
    );
    return;
  }

  // ── Micro: desired tenure ──────────────────────────────────────────────────
  if (state === STATE.MICRO_TENURE) {
    if (num < 3 || num > 12) {
      await sendText(from, `⚠️ Please enter a number between 3 and 12 months.`);
      return;
    }
    const { repaymentPlan } = getSession(from).data;
    const daily         = repaymentPlan.dailyAmount;
    const daysInPeriod  = num * 30;
    const totalViaDaily = daily * daysInPeriod;
    const sufficient    = totalViaDaily >= LOAN;
    const suggested     = Math.ceil(LOAN / daysInPeriod);
    const daysToRepay   = Math.ceil(LOAN / daily);

    updateSessionData(from, {
      repaymentPlan: { ...repaymentPlan, tenure: num, sufficient, suggestedDaily: suggested },
    });
    setSession(from, STATE.MICRO_CONFIRM);

    const summaryText = sufficient
      ? `🪙 *Micro Repayment Plan Summary*\n\n` +
        `• Daily payment:  ₹${daily.toLocaleString('en-IN')}\n` +
        `• Tenure:         ${num} months\n` +
        `• Days to repay:  ~${daysToRepay} days ✅\n\n` +
        `Your daily amount covers the loan within your chosen tenure.`
      : `⚠️ *Revised Suggestion*\n\n` +
        `₹${daily}/day is not enough to cover ₹${LOAN.toLocaleString('en-IN')} in ${num} months.\n\n` +
        `*Suggested daily amount: ₹${suggested.toLocaleString('en-IN')}*\n` +
        `_(to repay in exactly ${num} months)_`;

    await sendButtons(from, summaryText, [
      { id: 'plan_proceed', title: '✅ Proceed with Plan' },
      { id: 'plan_change',  title: '🔄 Start Over'        },
    ]);
    return;
  }
}
