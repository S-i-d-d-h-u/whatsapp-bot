// phase3_profiling.js — Phase 3 (v5) — minimal messages
import { sendText, sendButtons } from '../services/whatsappService.js';
import { setSession, getSession, updateSessionData, STATE } from '../utils/sessionManager.js';

const ANNUAL_REVENUE = 150000;
const MAX_LOAN       = 30000;
const TRANCHE_LIMITS = [
  { tranche: 1, max: MAX_LOAN, label: 'Tranche 1 — First-time applicant (20% of ₹1.5L revenue)' },
  { tranche: 2, max: MAX_LOAN, label: 'Tranche 2 — Repeat borrower'    },
  { tranche: 3, max: MAX_LOAN, label: 'Tranche 3 — Established vendor' },
];

const pause = ms => new Promise(r => setTimeout(r, ms));

// Entry — profiling message is okay per spec, keep it
export async function startProfiling(from) {
  setSession(from, STATE.PROFILING_REFS);
  await sendText(from,
    'We need two contact details for your application:\n\n' +
    '1. A Reference — neighbour, fellow vendor, or local shopkeeper\n' +
    '2. A Fallback Contact — family member or close friend\n\n' +
    'Please provide Reference Name and mobile number.\nExample: Suresh Kumar, 9876543210'
  );
}

export async function handleReferencesInput(from, text) {
  const { data } = getSession(from);
  const parts = text.split(/[,\s]+/);
  const phone = parts.find(p => /^\d{10}$/.test(p.replace(/\D/g, '')));
  const name  = parts.filter(p => !/^\d/.test(p)).join(' ').trim();

  if (!name || !phone) {
    await sendText(from, 'Please provide a name and 10-digit number.\nExample: Suresh Kumar, 9876543210');
    return;
  }

  if (!data.ref1Name) {
    updateSessionData(from, { ref1Name: name, ref1Phone: phone.replace(/\D/g,'') });
    await sendText(from, 'Now please provide your Fallback Contact.\nExample: Meena Devi, 9988776655');
  } else {
    updateSessionData(from, { ref2Name: name, ref2Phone: phone.replace(/\D/g,'') });
    await pause(400);
    await askFinancialConsent(from);
  }
}

// Financial consent — just the question, no explanation
export async function askFinancialConsent(from) {
  setSession(from, STATE.PROFILING_FINANCE);
  await sendButtons(
    from,
    'Do you give us permission to check your 36-month transaction history?',
    [
      { id: 'finance_yes', title: 'Yes' },
      { id: 'finance_no',  title: 'No'  },
    ],
    'Financial Check'
  );
}

export async function handleFinancialConsentReply(from, buttonId) {
  const doCheck = buttonId === 'finance_yes';
  updateSessionData(from, { financialCheckConsent: doCheck });
  if (doCheck) await pause(1500);
  else await pause(400);
  await showEligibilityResult(from, doCheck);
}

// Eligibility — amount + ask how much they want, no confirmation step
async function showEligibilityResult(from, didCheck) {
  setSession(from, STATE.LOAN_SELECTION);
  const { data } = getSession(from);
  const annualRevenue = didCheck ? 180000 : 150000;
  const trancheIdx    = data.previousLoan ? 1 : 0;
  const tranche       = TRANCHE_LIMITS[trancheIdx];

  updateSessionData(from, {
    eligibility: {
      annualRevenue, tranche: tranche.tranche,
      trancheLabel: tranche.label, maxLoan: MAX_LOAN,
      calculatedAt: new Date().toISOString(),
    },
  });

  await sendText(from,
    'You are eligible for up to Rs.' + MAX_LOAN.toLocaleString('en-IN') + '.\n\n' +
    'How much would you like to borrow? Enter an amount between Rs.5,000 and Rs.' + MAX_LOAN.toLocaleString('en-IN') + '.'
  );
}

// Loan amount — no confirmation buttons, go straight to KYC
export async function handleLoanAmountInput(from, text) {
  const { data } = getSession(from);
  const maxLoan  = data.eligibility?.maxLoan || MAX_LOAN;
  const amount   = parseInt(text.replace(/[^\d]/g, ''), 10);

  if (!amount || amount < 5000 || amount > maxLoan) {
    await sendText(from, 'Please enter an amount between Rs.5,000 and Rs.' + maxLoan.toLocaleString('en-IN') + '.');
    return;
  }

  updateSessionData(from, { loanAmount: amount });
  // Go straight to KYC — no confirmation message needed
  const { askKycReadiness } = await import('./phase4_videoKYC.js');
  await askKycReadiness(from);
}

// Stub — no longer needed since no confirmation buttons
export async function handleLoanConfirm(from, buttonId) {
  const { askKycReadiness } = await import('./phase4_videoKYC.js');
  await askKycReadiness(from);
}
