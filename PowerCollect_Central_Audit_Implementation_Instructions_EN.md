# Power Collect — Central Financial Audit Implementation Instructions

## Purpose and current implementation status

This file preserves the requirements clarified by the system owner and records the implementation completed locally on 9 October 2026.

**The owner subsequently authorized implementation of the separate central audit module, while preserving collections, transaction history and the financial ledger.** This replaces the earlier request to pause. The changes are local and have not been committed or deployed.

The branch section is named **الصندوق المالي (Financial Cashbox)**, its action **إقفال الصندوق (Close Cashbox)**, and the company module **التدقيق المالي (Financial Audit)**. Approved branch statements are submitted as immutable copies for manual transaction-level verification, clarification responses and final approval. The existing weekly closing and correction services are reused.

Read this alongside `PowerCollect_Weekly_Closing_Implementation_Spec_AR_EN.md`. The owner's latest clarification determines the audit scope: verification is manual initially, and the company's reference does not have to be entered into the website.

## Agreed business workflow

1. Each branch maintains its own cashbox and collection transactions.
2. The branch closes its cashbox, approves its statement, and sends it to central auditing.
3. Financial auditors belong to the company as a whole, rather than to individual operating branches.
4. A separate audit page receives daily, weekly, and monthly statements from all branches.
5. Auditors have a reference showing the receipts that reached the company. This reference may remain outside the website, such as a statement or document held by the audit department.
6. Auditors manually compare the branch statement with their reference and record the verification result in the website.
7. Matching transactions are confirmed. Individual disputed transactions are returned to the relevant party with a clear reason, then reviewed again after a response or correction.
8. The statement receives final audit approval after all pending transactions have been resolved and verified.

Sending a statement for audit is not a new collection and is not physical receipt of cash. Cash handover, internal transfers, and receipt confirmation remain in their existing separate workflow.

## Initial scope: manual verification

- Do not require an internal company receipts statement, reference upload, or entry of the reference's amounts or attachments in order to send or approve a statement.
- The auditor verifies transactions against the reference they hold. The website records the review decision.
- An optional review note or textual reference may be provided, without making it mandatory for submission or approval.
- Do not describe this as automated matching, or automatically confirm transactions simply because aggregate totals agree.
- Show funds retained at the branch or still in transit separately, so differences in receipt timing are not automatically treated as errors.

## Separate audit page and permissions

- Keep the audit page separate from the branch cashbox preparation and closing page.
- List only statements submitted for central review, with filters for branch, period type, date, and audit status.
- Show the statement's figures at submission, the transactions needed for verification, review notes, and action history.
- Allow authorized auditors to confirm transactions, return specific transactions with reasons, record notes, and grant final audit approval.
- Separate branch approval from central audit approval. Audit access must not automatically grant permission to edit or delete collections or readings.
- Enforce permissions on both the server and the interface. Branch staff access their branch's statements and related clarification requests; authorized central auditors review submitted statements from all branches.
- Do not automatically change existing users' permission grants. Review the impact of separating branch approval from audit approval on the existing roles.

## Statement and transaction review stages

The intended sequence is:

**Branch preparation → cashbox closing → branch approval and submission → central audit review → final audit approval.**

Branch closing and approval are separate responsibilities from the audit review status. Returning a transaction for clarification must not reopen a closed financial period.

Use clear transaction review states, such as awaiting review, confirmed, returned for clarification, and responded to awaiting verification. An auditor may request clarification for one transaction without returning other transactions already confirmed.

Block final audit approval while any transaction is unverified or returned. A branch response or financial correction must not automatically confirm the transaction; the auditor verifies it again.

Preserve who took each action, when, why, and the linked response or correction, without erasing previous actions. Protect submission and approval against concurrent requests and duplicate processing.

## Registering auditors under a central branch

Auditors belong to the company operationally. They may be registered administratively under a **central branch dedicated to the company's audit department**, using the existing user structure. The administrator's user form now exposes the functional role selection and explains the auditor's company-wide scope. No central branch or auditor account was automatically created, and existing permission grants were not changed.

The application already has a **Financial Auditor** role and company-wide permissions for viewing and auditing branch statements. Closing audit access is not restricted to the user's assigned branch, so a central branch can serve as an administrative association without limiting audit access to that branch's statements.

When registering auditors:

- The system administrator selects the central branch when creating an auditor account and assigns the auditor role and company-wide audit permissions.
- Make selection of the auditor role clear in the registration form. The descriptive user type field alone does not assign the financial role or grant its permissions.
- Do not automatically give auditors system administrator, branch administrator, or collection editing permissions. Do not treat the central branch as a cashbox that collects branch amounts again.
- Company-wide audit grants remain the system administrator's responsibility. Creating an account as a branch administrator does not automatically grant these permissions.
- Test that an auditor assigned to the central branch can review statements from all branches while ordinary branch staff remain restricted appropriately.

## Returned transactions and financial history protection

- Returning a transaction concerns its audit review; it must not automatically delete or cancel the original payment.
- If a clarification or supporting explanation resolves the issue, record the response and recheck it without changing financial amounts.
- If a financial error concerns a closed week, use the existing correction workflow: a new transaction in the current open period, linked to the original, with a clear reason.
- Do not edit the closed original transaction, replace the closing snapshot, or rewrite historical totals. Show the linked correction and its effect separately from the original statement's figures.
- Do not require historical figures to be changed in order to make the old statement match. Document the discrepancy's resolution and linked correction before completing the review.
- Preserve existing daily and monthly closing rules while separating branch approval from audit approval, without weakening weekly immutability.
- A transaction appearing in daily, weekly, and monthly statements remains one payment. Link its reviews to the original and show their results without duplicating collections or financial corrections.

## Separate future phase

The company may later enter its receipts reference into the website, enabling comparison between two independent sources: what reached the company and what each branch collected. **This is not required in the current scope.**

Organize review data so it can link to a future reference, without building imports, automated matching, or mandatory company statement entry now.

## Acceptance checks

- A branch submits its approved statement and it appears in central auditing under the correct branch and period.
- An authorized auditor can review all branches without collection editing privileges.
- External references can be used without uploading a file or entering a company statement.
- An auditor confirms matching transactions and returns one specific transaction with a mandatory reason, preserving other review results.
- Final approval is blocked with pending transactions, and re-verification is possible after a response.
- Correcting a transaction in a closed week preserves its original and historical snapshot, and links the new open-period correction to the returned transaction.
- Submitting or approving statements, and showing a payment in several period types, does not duplicate collections.
- Payments, readings, balances, transfers, and other closing rules continue to work.
- Test branch isolation, central audit authorization, review history, and concurrent requests; then build the frontend and visually inspect the updated screens.

## Implementation and future continuation

Daily branch approval now has its own interface actions and server authorization. A different authorized branch preparer approves or returns the daily cashbox closing. After approval, the branch sends a frozen daily statement to the central module. Weekly submissions use the closed weekly snapshot; monthly submissions require the period to have ended and the relevant daily closings to be approved.

Central auditing uses separate statement, line and event tables. The auditor confirms individual movements or returns them with a required reason; the branch responds and can link an existing related correction. All movements must be confirmed before final approval. Submission and final approval are protected against duplicate concurrent requests. Existing legacy endpoints remain compatible; the new interface uses the separate audit workflow. Entering a company reference or importing its statement remains future work.

Reuse existing closing services, correction services, and snapshot protections. Follow the project rules and applicable Laravel, Inertia, and testing skills. Do not rebuild unrelated financial features, change dependencies, or deploy as part of this work without a request.

The three audit tables were migrated locally. Relevant feature tests, collection/ledger regression tests, actual MySQL concurrency tests and the frontend build passed. Tests verify that sending, reviewing and approving audit statements do not alter the original financial transactions. An earlier full-suite run identified a separate existing Windows line-ending failure in the subscription import test; that unrelated behavior was left unchanged.
