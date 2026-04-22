// src/handlers/phase3_profiling.js — Phase 3: Profiling & Eligibility
// Flow: References → Financial Consent → Eligibility Calculation → Loan Selection
import { sendText, sendButtons }        from '../services/whatsappService.js';
import { setSession, getSession,
         updateSessionData, STATE }     from '../utils/sessionManager.js';

// Per spec: annual revenue ₹1.5L, max loan = 20% = ₹30,000
const ANNUAL_REVENUE  = 150000;
const MAX_LOAN        = 30000;
const TRANCHE_LIMITS = [
  { tranche: 1, max: MAX_LOAN, label: 'Tranche 1 — First-time applicant (20% of ₹1.5L revenue)' },
  { tranche: 2, max: MAX_LOAN, label: 'Tranche 2 — Repeat borrower'       },
  { tranche: 3, max: MAX_LOAN, label: 'Tranche 3 — Established vendor'    },
];

const pause = ms => new Promise(r => setTimeout(r, ms));

// ══════════════════════════════════════════════════════════════════════════
// ENTRY — called after all docs approved
// ══════════════════════════════════════════════════════════════════════════
export async function startProfiling(from) {
  setSession(from, STATE.PROFILING_REFS);
  await sendText(from,
    'Documents verified! Moving to Step 3 — Profiling.\n\n' +
    'We need two contact details for your application:\n\n' +
    '1. A Reference — someone who knows you (neighbour, fellow vendor, local shopkeeper)\n' +
    '2. A Fallback Contact — a family member or close friend\n\n' +
    'Please provide Reference Name and mobile number.\n\n' +
    'Example: Suresh Kumar, 9876543210'
  );
}

// ── Collect references via text ────────────────────────────────────────────
export async function handleReferencesInput(from, text) {
  const { data } = getSession(from);

  // Parse "Name, Number" or "Name Number" format
  const parts = text.split(/[,\s]+/);
  const phone = parts.find(p => /^\d{10}$/.test(p.replace(/\D/g, '')));
  const name  = parts.filter(p => !/^\d/.test(p)).join(' ').trim();

  if (!name || !phone) {
    await sendText(from,
      'Please provide both a name and a 10-digit mobile number.\n\n' +
      'Example: Suresh Kumar, 9876543210'
    );
    return;
  }

  if (!data.ref1Name) {
    // Saving first reference
    updateSessionData(from, { ref1Name: name, ref1Phone: phone.replace(/\D/g,'') });
    await sendText(from,
      'Reference saved: ' + name + '\n\n' +
      'Now please provide your Fallback Contact — a family member or close friend.\n\n' +
      'Example: Meena Devi, 9988776655'
    );
  } else {
    // Saving fallback contact
    updateSessionData(from, { ref2Name: name, ref2Phone: phone.replace(/\D/g,'') });
    await pause(400);
    await askFinancialConsent(from);
  }
}

// ── Financial consent ──────────────────────────────────────────────────────
export async function askFinancialConsent(from) {
  setSession(from, STATE.PROFILING_FINANCE);
  await sendButtons(
    from,
    'Financial Check\n\n' +
    'To calculate your exact loan limit, may we check your last 12 months of transaction history?\n\n' +
    'This helps us offer you the highest eligible loan amount.\n\n' +
    'We will never access your bank password or initiate any transaction.',
    [
      { id: 'finance_yes', title: 'Yes, check my history' },
      { id: 'finance_no',  title: 'Skip financial check'  },
    ],
    'Financial Eligibility Check',
    'Powered by Account Aggregator Framework'
  );
}

export async function handleFinancialConsentReply(from, buttonId) {
  const doCheck = buttonId === 'finance_yes';
  updateSessionData(from, { financialCheckConsent: doCheck });

  await sendText(from, doCheck
    ? 'Checking your transaction history... please wait a moment.'
    : 'Skipping financial check — using your document-based profile.'
  );
  if (doCheck) await pause(1800);

  await showEligibilityResult(from, doCheck);
}

// ── Eligibility calculation ────────────────────────────────────────────────
async function showEligibilityResult(from, didCheck) {
  setSession(from, STATE.LOAN_SELECTION);
  const { data } = getSession(from);

  // Simulate eligibility logic
  // In production: call AA framework / bank API with real data
  const annualRevenue  = didCheck ? 180000 : 150000;
  const trancheIdx     = data.previousLoan ? 1 : 0;   // bump if repeat borrower
  const tranche        = TRANCHE_LIMITS[trancheIdx];
  const maxLoan = MAX_LOAN; // always 30000 per spec

  updateSessionData(from, {
    eligibility: {
      annualRevenue,
      tranche:    tranche.tranche,
      trancheLabel: tranche.label,
      maxLoan,
      calculatedAt: new Date().toISOString(),
    },
  });

  await sendText(from,
    'Eligibility Result\n\n' +
    'Estimated Annual Income: Rs.' + annualRevenue.toLocaleString('en-IN') + '\n' +
    'Tranche: ' + tranche.label + '\n' +
    'Maximum Loan Amount: Rs.' + maxLoan.toLocaleString('en-IN') + '\n\n' +
    'How much would you like to borrow? Enter any amount between Rs.5,000 and Rs.' + maxLoan.toLocaleString('en-IN') + '.\n\n' +
    'Example: 15000'
  );
}

// ── Loan amount selection ──────────────────────────────────────────────────
export async function handleLoanAmountInput(from, text) {
  const { data }   = getSession(from);
  const maxLoan    = data.eligibility?.maxLoan || 10000;
  const raw        = text.replace(/[^\d]/g, '');
  const amount     = parseInt(raw, 10);

  if (!amount || amount < 5000 || amount > maxLoan) {
    await sendText(from,
      'Please enter a loan amount between Rs.5,000 and Rs.' + maxLoan.toLocaleString('en-IN') + '.\n\n' +
      'Example: ' + maxLoan
    );
    return;
  }

  updateSessionData(from, { loanAmount: amount });

  await sendButtons(
    from,
    'Loan Amount Confirmed\n\n' +
    'Amount: Rs.' + amount.toLocaleString('en-IN') + '\n' +
    'Interest: 7% p.a. (with subsidy)\n' +
    'Processing Fee: Rs.0\n\n' +
    'Shall we proceed to Video KYC — the final step?',
    [
      { id: 'loan_confirm', title: 'Proceed to KYC' },
      { id: 'loan_change',  title: 'Change amount'   },
    ],
    'Loan Amount: Rs.' + amount.toLocaleString('en-IN'),
    'Final step — Video KYC verification'
  );
}

export async function handleLoanConfirm(from, buttonId) {
  if (buttonId === 'loan_change') {
    const { data } = getSession(from);
    const max = data.eligibility?.maxLoan || 10000;
    await sendText(from,
      'Enter your desired loan amount (Rs.5,000 to Rs.' + max.toLocaleString('en-IN') + '):'
    );
    return;
  }
  // Proceed to KYC readiness check
  const { askKycReadiness } = await import('./phase4_videoKYC.js');
  await askKycReadiness(from);
}
