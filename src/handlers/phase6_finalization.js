// src/handlers/phase6_finalization.js  — Phase 6: Finalization
import { sendText, sendButtons, sendList }     from '../services/whatsappService.js';
import { setSession, getSession,
         clearSession, updateSessionData,
         STATE }                               from '../utils/sessionManager.js';
import { calculateMonthly,
         calculateSeasonal,
         calculateMicro }                      from '../../repaymentCalculator.js';

const pause = ms => new Promise(r => setTimeout(r, ms));

export async function finalizePlan(from) {
  const { data } = getSession(from);
  setSession(from, STATE.FINALIZED);

  const plan       = data.repaymentPlan || {};
  const loanAmount = data.loanAmount    || 25000;
  const loanRef    = data.approval?.loanRef || 'SVAN-' + Date.now().toString().slice(-8);

  await sendText(from, 'Finalizing your application... Please wait a moment.');
  await pause(1200);

  await sendSummaryTable(from, data, loanRef, loanAmount, plan);
  await pause(900);

  await sendRepaymentSchedule(from, plan, loanAmount);
  await pause(900);

  await sendReminderDisclaimer(from, plan, loanAmount);
  await pause(900);

  await sendClosingMessage(from);
  await pause(800);

  await sendSupportMenu(from);
}

async function sendSummaryTable(from, data, loanRef, loanAmount, plan) {
  const docs      = data.docs || {};
  const panStatus = docs.pan === 'SKIPPED' ? 'Skipped' : docs.pan ? 'Uploaded' : 'Not provided';
  const disburse  = data.approval?.disburseDate
    ? formatDate(new Date(data.approval.disburseDate))
    : formatDate(getNextWorkingDay());
  const planLine  = buildPlanSummary(plan, loanAmount);

  await sendText(from,
    'Application Confirmed!\n\n' +
    'LOAN DETAILS\n' +
    'Reference No: ' + loanRef + '\n' +
    'Loan Amount: Rs.' + loanAmount.toLocaleString('en-IN') + '\n' +
    'Scheme: PM SVANidhi\n' +
    'Interest Rate: 7% p.a. (subsidised)\n' +
    'Processing Fee: Rs.0\n' +
    'Disbursement: ' + disburse + '\n\n' +
    'APPLICANT DETAILS\n' +
    'Mobile: ' + (data.phone ? maskPhone(data.phone) : 'On file') + '\n' +
    'UPI ID: ' + (data.upiId === 'SKIPPED' ? 'Not provided' : (data.upiId || 'On file')) + '\n' +
    'KYC: Completed\n\n' +
    'DOCUMENTS SUBMITTED\n' +
    'Aadhaar/Voter ID: Uploaded\n' +
    'PAN Card: ' + panStatus + '\n' +
    'Bank Passbook: Uploaded\n' +
    'Video KYC: Completed\n\n' +
    'REPAYMENT PLAN\n' +
    planLine
  );
}

async function sendRepaymentSchedule(from, plan, loanAmount) {
  if (!plan?.type) return;

  if (plan.type === 'MONTHLY') {
    const r = calculateMonthly(plan.tenure, loanAmount);
    if (!r.valid) return;
    const rows = r.schedule.map(s =>
      'Month ' + String(s.month).padStart(2) + ': Rs.' + s.amount.toLocaleString('en-IN')
    ).join('\n');
    await sendText(from,
      'Monthly EMI Schedule\n\n' + rows + '\n\nTotal: Rs.' + r.totalPayable.toLocaleString('en-IN') + '\n\n' +
      'Payments due on the same date each month.'
    );

  } else if (plan.type === 'SEASONAL') {
    const r = calculateSeasonal(plan.highMonths, plan.highPayment, loanAmount);
    if (!r.valid) return;
    const rows = r.schedule.map(s =>
      'Month ' + String(s.month).padStart(2) + ' (' + (s.period === 'high' ? 'HIGH' : 'low ') + '): Rs.' + s.amount.toLocaleString('en-IN')
    ).join('\n');
    await sendText(from,
      'Seasonal Repayment Schedule\n\n' + rows + '\n\nTotal: Rs.' + r.totalPayable.toLocaleString('en-IN') +
      (r.warning ? '\n\nNote: ' + r.warning : '')
    );

  } else if (plan.type === 'MICRO') {
    const r = calculateMicro(plan.dailyAmount, plan.tenure, loanAmount);
    if (!r.valid) return;
    await sendText(from,
      'Micro Daily Repayment Schedule\n\n' +
      'Daily Payment: Rs.' + plan.dailyAmount.toLocaleString('en-IN') + ' per day\n' +
      'Weekly Total: Rs.' + (plan.dailyAmount * 7).toLocaleString('en-IN') + ' per week\n' +
      'Tenure: ' + plan.tenure + ' months (' + r.daysInPeriod + ' days)\n' +
      'Days to repay: approximately ' + r.daysToRepay + ' days\n\n' +
      (r.sufficient
        ? 'Your daily amount covers the loan in time.'
        : 'Note: Adjusted daily amount needed: Rs.' + r.suggestedDaily.toLocaleString('en-IN') + ' per day to cover the loan in ' + plan.tenure + ' months.'
      ) + '\n\nTip: Set a daily reminder on your phone to keep track.'
    );
  }
}

async function sendReminderDisclaimer(from, plan, loanAmount) {
  const firstDue = getFirstPaymentDate();
  let reminderAmt = '';
  if (plan.type === 'MONTHLY') {
    const emi = plan.emi || Math.ceil(loanAmount / plan.tenure);
    reminderAmt = 'Rs.' + emi.toLocaleString('en-IN') + ' monthly EMI';
  } else if (plan.type === 'SEASONAL') {
    reminderAmt = 'seasonal payment reminder';
  } else if (plan.type === 'MICRO') {
    reminderAmt = 'Rs.' + (plan.dailyAmount || 0).toLocaleString('en-IN') + ' daily payment';
  }

  await sendText(from,
    'Payment Reminders\n\n' +
    'You will receive SMS and Call reminders for your payments.\n\n' +
    'Reminder schedule:\n' +
    '- 3 days before each payment due date\n' +
    '- On the day of payment\n' +
    '- 2 days after (if unpaid)\n\n' +
    'First payment due: ' + formatDate(firstDue) + '\n' +
    'Reminder type: ' + reminderAmt + '\n\n' +
    'Important:\n' +
    '- Timely repayment earns 7% interest subsidy\n' +
    '- Missed payments may affect your credit score\n' +
    '- For payment help: 1800-11-1979 (toll free)'
  );
}

async function sendClosingMessage(from) {
  await sendText(from,
    'Congratulations on completing your application!\n\n' +
    'Thank you for using the PM SVANidhi scheme.\n\n' +
    'By repaying on time, you will unlock:\n' +
    '- 7% interest subsidy credited back to your account\n' +
    '- Cashback rewards on digital payments\n' +
    '- Higher loan limit (up to Rs.50,000) in next cycle\n' +
    '- Better credit score for future loans\n\n' +
    'We wish your business great success!\n\n' +
    'AtmaNirbhar Bharat starts with you.'
  );
}

async function sendSupportMenu(from) {
  await sendList(
    from,
    'Is there anything else you need help with?',
    'View Options',
    [
      {
        title: 'Application Support',
        rows: [
          { id: 'support_status',    title: 'Check Loan Status',  description: 'View your application progress' },
          { id: 'support_repayment', title: 'Repayment Help',      description: 'Payment methods and reminders' },
          { id: 'support_statement', title: 'Get Statement',        description: 'Your loan summary' },
        ],
      },
      {
        title: 'Other',
        rows: [
          { id: 'support_new',      title: 'New Application', description: 'Start a fresh application' },
          { id: 'support_helpline', title: 'Contact Helpline', description: 'Speak to an officer' },
        ],
      },
    ],
    'How can we help you?',
    'Available 9 AM to 6 PM on working days.'
  );
}

export async function handleSupportSelection(from, buttonId) {
  switch (buttonId) {

    case 'support_status': {
      const { data } = getSession(from);
      const ref      = data.approval?.loanRef || 'Not available';
      const disburse = data.approval?.disburseDate
        ? formatDate(new Date(data.approval.disburseDate)) : 'Within 24 hours';
      await sendText(from,
        'Loan Status\n\n' +
        'Reference No: ' + ref + '\n' +
        'Status: Approved\n' +
        'Disbursement: ' + disburse + '\n' +
        'KYC: Verified\n' +
        'Documents: Submitted\n\n' +
        'You will receive an SMS once amount is credited.\n' +
        'For details: pmsvanidhi.mohua.gov.in'
      );
      await pause(600);
      await sendSupportMenu(from);
      break;
    }

    case 'support_repayment': {
      const { data } = getSession(from);
      await sendText(from,
        'How to Make Payments\n\n' +
        '1. UPI / Digital Payment (Recommended - earns cashback)\n' +
        '   Any UPI app: PhonePe, GPay, Paytm\n' +
        '   UPI ID: pmsvanidhi@sbi\n\n' +
        '2. Bank Transfer / NEFT\n' +
        '   Use your Loan Reference as the remark\n\n' +
        '3. Cash at CSC / Bank Branch\n' +
        '   Visit nearest Common Service Centre\n' +
        '   Carry your Loan Reference Number\n\n' +
        'Payment issues? Call 1800-11-1979\n' +
        'Ref: ' + (data.approval?.loanRef || 'See approval message above')
      );
      await pause(600);
      await sendSupportMenu(from);
      break;
    }

    case 'support_statement': {
      const { data }   = getSession(from);
      const loanAmount = data.loanAmount || 25000;
      const plan       = data.repaymentPlan || {};
      const ref        = data.approval?.loanRef || 'N/A';
      await sendText(from,
        'Loan Summary Statement\n\n' +
        'PM SVANidhi Yojana\n' +
        'Ministry of Housing and Urban Affairs\n\n' +
        'Ref No: ' + ref + '\n' +
        'Date: ' + formatDate(new Date()) + '\n' +
        'Mobile: ' + (data.phone ? maskPhone(data.phone) : 'On file') + '\n\n' +
        'Loan Amount: Rs.' + loanAmount.toLocaleString('en-IN') + '\n' +
        'Status: APPROVED\n' +
        'KYC: Completed\n\n' +
        'Plan: ' + buildPlanSummary(plan, loanAmount) + '\n\n' +
        'Screenshot this message for your records.\n' +
        'Official portal: pmsvanidhi.mohua.gov.in'
      );
      await pause(600);
      await sendSupportMenu(from);
      break;
    }

    case 'support_new': {
      await sendButtons(from,
        'Start a New Application?\n\n' +
        'This will clear your current session and restart from the beginning.\n\nAre you sure?',
        [
          { id: 'new_app_confirm', title: 'Yes, start fresh' },
          { id: 'new_app_cancel',  title: 'No, go back'      },
        ]
      );
      break;
    }

    case 'new_app_confirm': {
      clearSession(from);
      const { startOnboarding } = await import('./phase0_onboarding.js');
      await startOnboarding(from);
      break;
    }

    case 'new_app_cancel': {
      await sendSupportMenu(from);
      break;
    }

    case 'support_helpline': {
      await sendText(from,
        'PM SVANidhi Helpline\n\n' +
        'Toll-Free: 1800-11-1979\n' +
        'Hours: 9:00 AM to 6:00 PM\n' +
        'Days: Monday to Saturday\n\n' +
        'Online:\n' +
        'Portal: pmsvanidhi.mohua.gov.in\n' +
        'App: PM SVANidhi (Play Store / App Store)\n' +
        'Email: support@pmsvanidhi.gov.in\n\n' +
        'Keep your Loan Reference Number ready when calling.'
      );
      await pause(600);
      await sendSupportMenu(from);
      break;
    }

    default:
      await sendSupportMenu(from);
  }
}

export async function handleFinalizedText(from, text) {
  const lower = text.toLowerCase().trim();
  if (['hi','hello','start','menu','restart','namaste','new'].includes(lower)) {
    const { startOnboarding } = await import('./phase0_onboarding.js');
    await startOnboarding(from);
    return;
  }
  await sendText(from,
    'Your application is complete!\n\n' +
    'Your PM SVANidhi loan has been approved. Use the menu below for support.'
  );
  await sendSupportMenu(from);
}

function buildPlanSummary(plan, loanAmount) {
  if (!plan?.type) return 'Not selected';
  if (plan.type === 'MONTHLY') {
    const emi   = plan.emi || Math.ceil(loanAmount / (plan.tenure || 6));
    return 'Monthly EMI: Rs.' + emi.toLocaleString('en-IN') + ' x ' + plan.tenure + ' months';
  }
  if (plan.type === 'SEASONAL') {
    const low = 12 - (plan.highMonths || 0);
    return 'Seasonal: Rs.' + (plan.highPayment || 0).toLocaleString('en-IN') + '/mo (high, ' + plan.highMonths + ' months) | Rs.' + (plan.lowPayment || 0).toLocaleString('en-IN') + '/mo (low, ' + low + ' months)';
  }
  if (plan.type === 'MICRO') {
    return 'Micro Daily: Rs.' + (plan.dailyAmount || 0).toLocaleString('en-IN') + '/day for ' + plan.tenure + ' months';
  }
  return 'Custom plan';
}

function maskPhone(p)  { return p?.length >= 6 ? 'XXXXXX' + p.slice(-4) : p; }
function formatDate(d) { return d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); }
function getNextWorkingDay() {
  const d = new Date(); d.setDate(d.getDate() + 1);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return d;
}
function getFirstPaymentDate() {
  const d = new Date(); d.setDate(d.getDate() + 30); return d;
}
