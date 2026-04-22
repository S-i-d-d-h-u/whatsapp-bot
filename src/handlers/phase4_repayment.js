// src/handlers/phase4_repayment.js  — Phase 4/5: Repayment Plans
import { sendText, sendList, sendButtons,
         sendImage }                           from '../services/whatsappService.js';
import { setSession, getSession, updateSessionData,
         STATE }                               from '../utils/sessionManager.js';

const LOAN_DEFAULT = 30000; // PM SVANidhi max: 20% of ₹1.5L annual revenue
const getLoan = (from) => { const { data } = require; return data?.loanAmount || LOAN_DEFAULT; };
const REPAY_IMG = process.env.REPAY_IMG_URL || '';
const pause     = ms => new Promise(r => setTimeout(r, ms));

export async function showRepaymentMenu(from) {
  setSession(from, STATE.REPAYMENT_MENU);

  // Send repayment options image if URL is configured
  if (REPAY_IMG) {
    await sendImage(
      from,
      REPAY_IMG,
      'Your 3 repayment plan options — choose what works best for your business'
    ).catch(err => console.error('[Repay] Image send failed:', err.message));
    await pause(500);
  }

  await sendList(
    from,
    'Choose Your Repayment Plan\n\nSelect the plan that best fits your income pattern.',
    'View Plans',
    [{
      title: 'Repayment Options',
      rows: [
        { id: 'repay_monthly',  title: 'Monthly Fixed EMI',     description: 'Pay equal amount every month' },
        { id: 'repay_seasonal', title: 'Seasonal Repayment',    description: 'Pay more during festival months' },
        { id: 'repay_micro',    title: 'Micro Daily Repayment', description: 'Pay small amounts every day' },
      ],
    }],
    'Repayment Setup',
    'Choose the plan that suits your business.'
  );
}

export async function handleRepaymentSelection(from, state, buttonId) {

  if (buttonId === 'repay_monthly') {
    setSession(from, STATE.MONTHLY_EMI);
    await sendText(from,
      'Monthly Fixed EMI Plan\n\n' +
      'Loan Amount: Rs.' + LOAN_DEFAULT.toLocaleString('en-IN') + '\n\n' +
      'Please enter your preferred repayment tenure in months.\n\n' +
      'Options: 3, 6, 9, or 12 months'
    );
    return;
  }

  if (buttonId === 'repay_seasonal') {
    setSession(from, STATE.SEASONAL_HIGH);
    await sendText(from,
      'Seasonal Repayment Plan\n\n' +
      'This plan lets you pay more during high-income festival months and less during slow periods.\n\n' +
      'How many months per year are high-income months for your business?\n\n' +
      'Example: 4 (Diwali, Holi, Eid, Christmas)\n\n' +
      'Enter a number between 1 and 11:'
    );
    return;
  }

  if (buttonId === 'repay_micro') {
    setSession(from, STATE.MICRO_DAILY);
    await sendText(from,
      'Micro Daily Repayment Plan\n\n' +
      'Pay a small fixed amount every day - ideal for vendors with daily cash income.\n\n' +
      'Loan Amount: Rs.' + LOAN_DEFAULT.toLocaleString('en-IN') + '\n\n' +
      'How much can you pay per day (in Rs.)?\n\n' +
      'Example: 50 or 100'
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
    await sendText(from, 'Please enter a new tenure in months (3, 6, 9, or 12):');
    return;
  }
}

export async function handleRepaymentInput(from, state, text) {
  const num = parseInt(text.trim(), 10);
  if (isNaN(num) || num <= 0) {
    await sendText(from, 'Please enter a valid number. For example: 6 for months, or 50 for Rs.50 per day.');
    return;
  }

  if (state === STATE.MONTHLY_EMI) {
    if (![3, 6, 9, 12].includes(num)) {
      await sendText(from, 'Please choose: 3, 6, 9, or 12 months.');
      return;
    }
    const loanAmt = getSession(from).data.loanAmount || LOAN_DEFAULT;
    const emi = Math.ceil(loanAmt / num);
    updateSessionData(from, { repaymentPlan: { type: 'MONTHLY', tenure: num, emi } });
    setSession(from, STATE.MONTHLY_CONFIRM);
    await sendButtons(from,
      'Monthly EMI Plan Summary\n\n' +
      'Loan Amount: Rs.' + LOAN_DEFAULT.toLocaleString('en-IN') + '\n' +
      'Tenure: ' + num + ' months\n' +
      'Monthly EMI: Rs.' + emi.toLocaleString('en-IN') + '\n\n' +
      'First payment due 30 days after disbursement.',
      [
        { id: 'plan_proceed',       title: 'Proceed with Plan' },
        { id: 'plan_change_tenure', title: 'Change Tenure'     },
      ]
    );
    return;
  }

  if (state === STATE.SEASONAL_HIGH) {
    if (num < 1 || num > 11) {
      await sendText(from, 'Please enter a number between 1 and 11.');
      return;
    }
    updateSessionData(from, { repaymentPlan: { type: 'SEASONAL', highMonths: num } });
    setSession(from, STATE.SEASONAL_LOW);
    await sendText(from,
      'How much can you pay per month during your high-income months? (in Rs.)\n\n' +
      'Example: 3000'
    );
    return;
  }

  if (state === STATE.SEASONAL_LOW) {
    const { repaymentPlan } = getSession(from).data;
    const highMonths = repaymentPlan.highMonths;
    const lowMonths  = 12 - highMonths;
    const loanAmtS = getSession(from).data.loanAmount || LOAN_DEFAULT;
    const highTotal  = num * highMonths;
    const remaining  = Math.max(loanAmtS - highTotal, 0);
    const lowEMI     = lowMonths > 0 ? Math.ceil(remaining / lowMonths) : 0;
    const total      = num * highMonths + lowEMI * lowMonths;

    updateSessionData(from, {
      repaymentPlan: { ...repaymentPlan, highPayment: num, lowPayment: lowEMI },
    });
    setSession(from, STATE.SEASONAL_CONFIRM);

    const warning = highTotal >= loanAmtS
      ? '\nNote: Your high-period payments alone cover the loan. No low-month payment needed.' : '';

    await sendButtons(from,
      'Seasonal Plan Summary\n\n' +
      'High months (' + highMonths + '): Rs.' + num.toLocaleString('en-IN') + ' per month\n' +
      'Low months (' + lowMonths + '): Rs.' + lowEMI.toLocaleString('en-IN') + ' per month\n' +
      'Total repaid: Rs.' + total.toLocaleString('en-IN') + warning,
      [
        { id: 'plan_proceed', title: 'Proceed with Plan' },
        { id: 'plan_change',  title: 'Start Over'        },
      ]
    );
    return;
  }

  if (state === STATE.MICRO_DAILY) {
    updateSessionData(from, { repaymentPlan: { type: 'MICRO', dailyAmount: num } });
    setSession(from, STATE.MICRO_TENURE);
    await sendText(from,
      'In how many months would you like to repay the loan?\n\nEnter a number between 3 and 12:'
    );
    return;
  }

  if (state === STATE.MICRO_TENURE) {
    if (num < 3 || num > 12) {
      await sendText(from, 'Please enter a number between 3 and 12 months.');
      return;
    }
    const { repaymentPlan } = getSession(from).data;
    const daily         = repaymentPlan.dailyAmount;
    const daysInPeriod  = num * 30;
    const totalViaDaily = daily * daysInPeriod;
    const loanAmtM = getSession(from).data.loanAmount || LOAN_DEFAULT;
    const sufficient    = totalViaDaily >= loanAmtM;
    const suggested     = Math.ceil(loanAmtM / daysInPeriod);
    const daysToRepay   = Math.ceil(loanAmtM / daily);

    updateSessionData(from, {
      repaymentPlan: { ...repaymentPlan, tenure: num, sufficient, suggestedDaily: suggested },
    });
    setSession(from, STATE.MICRO_CONFIRM);

    const summaryText = sufficient
      ? 'Micro Repayment Plan Summary\n\n' +
        'Daily payment: Rs.' + daily.toLocaleString('en-IN') + '\n' +
        'Tenure: ' + num + ' months\n' +
        'Days to repay: approximately ' + daysToRepay + ' days\n\n' +
        'Your daily amount covers the loan within your chosen tenure.'
      : 'Revised Suggestion\n\n' +
        'Rs.' + daily + ' per day is not enough to cover Rs.' + LOAN_DEFAULT.toLocaleString('en-IN') + ' in ' + num + ' months.\n\n' +
        'Suggested daily amount: Rs.' + suggested.toLocaleString('en-IN') + '\n' +
        '(to repay in exactly ' + num + ' months)';

    await sendButtons(from, summaryText, [
      { id: 'plan_proceed', title: 'Proceed with Plan' },
      { id: 'plan_change',  title: 'Start Over'        },
    ]);
    return;
  }
}