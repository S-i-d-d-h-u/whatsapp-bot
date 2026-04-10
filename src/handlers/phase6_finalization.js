// src/handlers/phase6_finalization.js  — Phase 6: Finalization
// FIX: corrected repaymentCalculator import path from ../../ (handlers → src → root)
import { sendText, sendButtons, sendList }     from '../services/whatsappService.js';
import { setSession, getSession,
         clearSession, updateSessionData,
         STATE }                               from '../utils/sessionManager.js';
import { calculateMonthly,
         calculateSeasonal,
         calculateMicro }                      from '../../repaymentCalculator.js';

const pause = ms => new Promise(r => setTimeout(r, ms));

// ══════════════════════════════════════════════════════════════════════════
// ENTRY — called from phase4 when user taps "Proceed with Plan"
// ══════════════════════════════════════════════════════════════════════════
export async function finalizePlan(from) {
  const { data } = getSession(from);
  setSession(from, STATE.FINALIZED);

  const plan       = data.repaymentPlan || {};
  const loanAmount = data.loanAmount    || 25_000;
  const loanRef    = data.approval?.loanRef || `SVAN-${Date.now().toString().slice(-8)}`;

  await sendText(from, `⏳ *Finalizing your application...* Please wait a moment.`);
  await pause(1200);

  // Step 1 — Full application summary
  await sendSummaryTable(from, data, loanRef, loanAmount, plan);
  await pause(900);

  // Step 2 — Repayment schedule breakdown
  await sendRepaymentSchedule(from, plan, loanAmount);
  await pause(900);

  // Step 3 — Reminder disclaimer
  await sendReminderDisclaimer(from, plan, loanAmount);
  await pause(900);

  // Step 4 — Warm closing message
  await sendClosingMessage(from);
  await pause(800);

  // Step 5 — Post-application support menu
  await sendSupportMenu(from);
}

// ══════════════════════════════════════════════════════════════════════════
// STEP 1 — Full Application Summary Table
// ══════════════════════════════════════════════════════════════════════════
async function sendSummaryTable(from, data, loanRef, loanAmount, plan) {
  const docs        = data.docs || {};
  const panStatus   = docs.pan === 'SKIPPED' ? 'Skipped' : docs.pan ? 'Uploaded ✅' : 'Not provided';
  const disburseDate = data.approval?.disburseDate
    ? formatDate(new Date(data.approval.disburseDate))
    : formatDate(getNextWorkingDay());
  const planLine    = buildPlanSummaryLines(plan, loanAmount);

  await sendText(from,
    `✅ *Application Confirmed!*\n\n` +

    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `📋 *LOAN DETAILS*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `• Reference No:    *${loanRef}*\n` +
    `• Loan Amount:     *₹${loanAmount.toLocaleString('en-IN')}*\n` +
    `• Scheme:          PM SVANidhi\n` +
    `• Interest Rate:   7% p.a. (subsidised)\n` +
    `• Processing Fee:  ₹0\n` +
    `• Disbursement:    ${disburseDate}\n\n` +

    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `👤 *APPLICANT DETAILS*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `• Mobile:    ${data.phone ? maskPhone(data.phone) : 'On file'}\n` +
    `• UPI ID:    ${data.upiId === 'SKIPPED' ? 'Not provided' : (data.upiId || 'On file')}\n` +
    `• KYC:       Completed ✅\n\n` +

    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `📄 *DOCUMENTS SUBMITTED*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `• Aadhaar/Voter ID:  ✅ Uploaded\n` +
    `• PAN Card:          ${panStatus}\n` +
    `• Bank Passbook:     ✅ Uploaded\n` +
    `• Video KYC:         ✅ Completed\n\n` +

    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `💳 *REPAYMENT PLAN*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `${planLine}\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
  );
}

// ══════════════════════════════════════════════════════════════════════════
// STEP 2 — Repayment Schedule Breakdown
// ══════════════════════════════════════════════════════════════════════════
async function sendRepaymentSchedule(from, plan, loanAmount) {
  if (!plan?.type) return;

  if (plan.type === 'MONTHLY') {
    const r = calculateMonthly(plan.tenure, loanAmount);
    if (!r.valid) return;
    const rows = r.schedule.map(s =>
      `  Month ${String(s.month).padStart(2)}  │  ₹${s.amount.toLocaleString('en-IN')}`
    ).join('\n');
    await sendText(from,
      `📅 *Monthly EMI Schedule*\n\n` +
      `  Month  │  Payment\n` +
      `  ───────┼──────────\n` +
      `${rows}\n\n` +
      `  *Total: ₹${r.totalPayable.toLocaleString('en-IN')}*\n\n` +
      `_Payments due on the same date each month._`
    );

  } else if (plan.type === 'SEASONAL') {
    const r = calculateSeasonal(plan.highMonths, plan.highPayment, loanAmount);
    if (!r.valid) return;
    const rows = r.schedule.map(s => {
      const tag = s.period === 'high' ? '🔴 HIGH' : '🔵 low ';
      return `  Month ${String(s.month).padStart(2)}  │  ${tag}  ₹${s.amount.toLocaleString('en-IN')}`;
    }).join('\n');
    await sendText(from,
      `🎪 *Seasonal Repayment Schedule*\n` +
      `  🔴 = High-income month   🔵 = Low-income month\n\n` +
      `  Month  │  Type    Payment\n` +
      `  ───────┼─────────────────\n` +
      `${rows}\n\n` +
      `  *Total: ₹${r.totalPayable.toLocaleString('en-IN')}*` +
      (r.warning ? `\n\n⚠️ ${r.warning}` : '')
    );

  } else if (plan.type === 'MICRO') {
    const r = calculateMicro(plan.dailyAmount, plan.tenure, loanAmount);
    if (!r.valid) return;
    const weeklyAmt = plan.dailyAmount * 7;
    await sendText(from,
      `🪙 *Micro Daily Repayment Schedule*\n\n` +
      `  Daily Payment    │  ₹${plan.dailyAmount.toLocaleString('en-IN')}/day\n` +
      `  Weekly Total     │  ₹${weeklyAmt.toLocaleString('en-IN')}/week\n` +
      `  Tenure           │  ${plan.tenure} months (~${r.daysInPeriod} days)\n` +
      `  ─────────────────┼──────────────────\n` +
      `  Days to repay    │  ~${r.daysToRepay} days\n` +
      `  Total payable    │  ₹${(plan.dailyAmount * r.daysToRepay).toLocaleString('en-IN')}\n\n` +
      (r.sufficient
        ? `✅ Your daily amount covers the loan in time.`
        : `⚠️ Adjusted daily amount: ₹${r.suggestedDaily.toLocaleString('en-IN')}/day\n_(to cover the loan in ${plan.tenure} months)_`
      ) + '\n\n' +
      `_Tip: Set a daily reminder on your phone to keep track._`
    );
  }
}

// ══════════════════════════════════════════════════════════════════════════
// STEP 3 — Reminder Disclaimer
// ══════════════════════════════════════════════════════════════════════════
async function sendReminderDisclaimer(from, plan, loanAmount) {
  const firstDue = getFirstPaymentDate();

  let reminderAmt = '';
  if (plan.type === 'MONTHLY') {
    const emi = plan.emi || Math.ceil(loanAmount / plan.tenure);
    reminderAmt = `*₹${emi.toLocaleString('en-IN')}* monthly EMI`;
  } else if (plan.type === 'SEASONAL') {
    reminderAmt = `seasonal payment reminder`;
  } else if (plan.type === 'MICRO') {
    reminderAmt = `*₹${plan.dailyAmount?.toLocaleString('en-IN')}* daily payment`;
  }

  await sendText(from,
    `📲 *Payment Reminders*\n\n` +
    `You will receive *SMS and Call reminders* for your payments.\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `⏰ *Reminder schedule:*\n` +
    `• 3 days before each payment due date\n` +
    `• On the day of payment\n` +
    `• 2 days after (if unpaid)\n\n` +
    `📅 *First payment due:* ${formatDate(firstDue)}\n` +
    `💬 *Reminder type:* ${reminderAmt}\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `⚠️ *Important:*\n` +
    `• Timely repayment earns *7% interest subsidy*\n` +
    `• Missed payments may affect your *credit score*\n` +
    `• For payment help: *1800-11-1979* (toll free)\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
  );
}

// ══════════════════════════════════════════════════════════════════════════
// STEP 4 — Warm Closing Message
// ══════════════════════════════════════════════════════════════════════════
async function sendClosingMessage(from) {
  await sendText(from,
    `🎊 *Congratulations on completing your application!*\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🛒 *Thank you for using the PM SVANidhi scheme.*\n\n` +
    `By repaying on time, you will unlock:\n\n` +
    `• 📉 *7% interest subsidy* credited back to your account\n` +
    `• 💸 *Cashback rewards* on digital payments\n` +
    `• 📈 *Higher loan limit* (up to ₹50,000) in next cycle\n` +
    `• 🏦 *Better credit score* for future loans\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `*We wish your business great success!* 🌟\n\n` +
    `_"AtmaNirbhar Bharat starts with you."_\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
  );
}

// ══════════════════════════════════════════════════════════════════════════
// STEP 5 — Post-Application Support Menu
// ══════════════════════════════════════════════════════════════════════════
async function sendSupportMenu(from) {
  await sendList(
    from,
    `Is there anything else you need help with?`,
    'View Options',
    [
      {
        title: 'Application Support',
        rows: [
          { id: 'support_status',     title: '📊 Check Loan Status',  description: 'View your application progress' },
          { id: 'support_repayment',  title: '💳 Repayment Help',      description: 'Payment methods and reminders' },
          { id: 'support_statement',  title: '📄 Get Statement',        description: 'Download your loan summary' },
        ],
      },
      {
        title: 'Other',
        rows: [
          { id: 'support_new',        title: '🔄 New Application',     description: 'Start a fresh application' },
          { id: 'support_helpline',   title: '📞 Contact Helpline',    description: 'Speak to a PM SVANidhi officer' },
        ],
      },
    ],
    'How can we help you?',
    'Available 9 AM – 6 PM on working days.'
  );
}

// ══════════════════════════════════════════════════════════════════════════
// POST-FINALIZATION SUPPORT HANDLER
// ══════════════════════════════════════════════════════════════════════════
export async function handleSupportSelection(from, buttonId) {
  switch (buttonId) {

    case 'support_status': {
      const { data } = getSession(from);
      const ref      = data.approval?.loanRef || 'Not available';
      const disburse = data.approval?.disburseDate
        ? formatDate(new Date(data.approval.disburseDate)) : 'Within 24 hours';
      await sendText(from,
        `📊 *Loan Status*\n\n` +
        `• Reference No:  *${ref}*\n` +
        `• Status:        ✅ *Approved*\n` +
        `• Disbursement:  ${disburse}\n` +
        `• KYC:           ✅ Verified\n` +
        `• Documents:     ✅ Submitted\n\n` +
        `_You will receive an SMS once amount is credited._\n` +
        `For details: *pmsvanidhi.mohua.gov.in*`
      );
      await pause(600);
      await sendSupportMenu(from);
      break;
    }

    case 'support_repayment': {
      const { data } = getSession(from);
      await sendText(from,
        `💳 *How to Make Payments*\n\n` +
        `1️⃣  *UPI / Digital Payment* _(Recommended — earns cashback)_\n` +
        `   • Any UPI app: PhonePe, GPay, Paytm\n` +
        `   • UPI ID: *pmsvanidhi@sbi*\n\n` +
        `2️⃣  *Bank Transfer / NEFT*\n` +
        `   • Use your Loan Reference as the remark\n\n` +
        `3️⃣  *Cash at CSC / Bank Branch*\n` +
        `   • Visit nearest Common Service Centre\n` +
        `   • Carry your Loan Reference Number\n\n` +
        `📞 Payment issues? Call *1800-11-1979*\n` +
        `_Ref: ${data.approval?.loanRef || 'See approval message above'}_`
      );
      await pause(600);
      await sendSupportMenu(from);
      break;
    }

    case 'support_statement': {
      const { data }   = getSession(from);
      const loanAmount = data.loanAmount || 25_000;
      const plan       = data.repaymentPlan || {};
      const ref        = data.approval?.loanRef || 'N/A';
      await sendText(from,
        `📄 *Loan Summary Statement*\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `  PM SVANidhi Yojana\n` +
        `  Ministry of Housing & Urban Affairs\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `  Ref No:       ${ref}\n` +
        `  Date:         ${formatDate(new Date())}\n` +
        `  Mobile:       ${data.phone ? maskPhone(data.phone) : 'On file'}\n\n` +
        `  Loan Amount:  ₹${loanAmount.toLocaleString('en-IN')}\n` +
        `  Status:       APPROVED ✅\n` +
        `  KYC:          Completed\n\n` +
        `  Plan:         ${buildPlanSummaryLines(plan, loanAmount)}\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `_Screenshot this message for your records._\n` +
        `_Official portal: pmsvanidhi.mohua.gov.in_`
      );
      await pause(600);
      await sendSupportMenu(from);
      break;
    }

    case 'support_new': {
      await sendButtons(from,
        `🔄 *Start a New Application?*\n\n` +
        `This will clear your current session and restart from the beginning.\n\nAre you sure?`,
        [
          { id: 'new_app_confirm', title: '✅ Yes, start fresh' },
          { id: 'new_app_cancel',  title: '❌ No, go back'      },
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
        `📞 *PM SVANidhi Helpline*\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `🆓 Toll-Free:  *1800-11-1979*\n` +
        `🕐 Hours:      9:00 AM – 6:00 PM\n` +
        `📅 Days:       Monday to Saturday\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `*Online:*\n` +
        `• Portal: pmsvanidhi.mohua.gov.in\n` +
        `• App:    PM SVANidhi (Play Store / App Store)\n` +
        `• Email:  support@pmsvanidhi.gov.in\n\n` +
        `_Keep your Loan Reference Number ready when calling._`
      );
      await pause(600);
      await sendSupportMenu(from);
      break;
    }

    default:
      await sendSupportMenu(from);
  }
}

// ══════════════════════════════════════════════════════════════════════════
// POST-FINALIZATION TEXT GUARD
// ══════════════════════════════════════════════════════════════════════════
export async function handleFinalizedText(from, text) {
  const lower = text.toLowerCase().trim();
  if (['hi','hello','start','menu','restart','namaste','new'].includes(lower)) {
    const { startOnboarding } = await import('./phase0_onboarding.js');
    await startOnboarding(from);
    return;
  }
  await sendText(from,
    `✅ *Your application is complete!*\n\n` +
    `Your PM SVANidhi loan has been approved. Use the menu below for support.`
  );
  await sendSupportMenu(from);
}

// ══════════════════════════════════════════════════════════════════════════
// UTILITIES
// ══════════════════════════════════════════════════════════════════════════
function buildPlanSummaryLines(plan, loanAmount) {
  if (!plan?.type) return 'Not selected';
  if (plan.type === 'MONTHLY') {
    const emi   = plan.emi || Math.ceil(loanAmount / (plan.tenure || 6));
    const total = emi * plan.tenure;
    return `📅 Monthly EMI\n  ₹${emi.toLocaleString('en-IN')}/month × ${plan.tenure} months = ₹${total.toLocaleString('en-IN')}`;
  }
  if (plan.type === 'SEASONAL') {
    const lowMonths = 12 - (plan.highMonths || 0);
    const total     = (plan.highPayment * plan.highMonths) + (plan.lowPayment * lowMonths);
    return `🎪 Seasonal (12 months)\n  High (${plan.highMonths}mo): ₹${plan.highPayment?.toLocaleString('en-IN')}/mo\n  Low  (${lowMonths}mo): ₹${plan.lowPayment?.toLocaleString('en-IN')}/mo\n  Total: ₹${total.toLocaleString('en-IN')}`;
  }
  if (plan.type === 'MICRO') {
    const days  = Math.ceil(loanAmount / (plan.dailyAmount || 1));
    return `🪙 Micro Daily\n  ₹${plan.dailyAmount?.toLocaleString('en-IN')}/day × ~${days} days\n  Tenure: ${plan.tenure} months`;
  }
  return 'Custom plan';
}

function maskPhone(p)  { return p?.length >= 6 ? `XXXXXX${p.slice(-4)}` : p; }
function formatDate(d) { return d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); }
function getNextWorkingDay() {
  const d = new Date(); d.setDate(d.getDate() + 1);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return d;
}
function getFirstPaymentDate() {
  const d = new Date(); d.setDate(d.getDate() + 30); return d;
}
