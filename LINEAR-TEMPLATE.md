# Linear Issue Template — Kairo Features
# Share this with your co-founder. He fills this out, you label it "ready-for-agent".

---

## Template (copy this for every new feature idea)

**Title:** [short name, e.g. "Password reset i18n"]

**Problem**
What can't the user do today? What's broken or missing?
(1-3 sentences, no tech jargon needed)

**Expected behavior**
What should happen after this is built?
Describe it like you're explaining to a user, not a developer.

**Acceptance criteria**
- [ ] Criteria 1 (e.g. "Form shows in Spanish when browser is set to ES")
- [ ] Criteria 2
- [ ] Criteria 3

**Edge cases / notes**
Anything extra: which users are affected, which screen, any exceptions.

**Priority**
[ ] Blocking users  [ ] Important but not urgent  [ ] Nice to have

---

## Example — filled out correctly

**Title:** Password reset form — Spanish support

**Problem**
The "Forgot password?" flow is entirely in English. Our target customers
in Latin America are confused and some have given up on recovering access.

**Expected behavior**
When a user's browser is set to Spanish, all text in the password reset
flow should appear in Spanish — the link, the email we send, and the
confirmation screen.

**Acceptance criteria**
- [ ] "Forgot password?" link shows as "¿Olvidaste tu contraseña?" in ES
- [ ] Reset email body is in Spanish when user locale is ES
- [ ] Confirmation screen after reset is in Spanish
- [ ] English still works perfectly for EN locale

**Edge cases / notes**
If we can't detect locale, default to English.
Same logic we already use on the login form.

**Priority**
[x] Blocking users

---

## Labels to use in Linear

| Label             | Meaning                                              |
|-------------------|------------------------------------------------------|
| `idea`            | Co-founder dropped this, needs review                |
| `ready-for-agent` | Alejandro reviewed it, agent can implement           |
| `in-progress`     | Agent or Alejandro is working on it                  |
| `done`            | Merged to dev                                        |
| `needs-discussion`| Too ambiguous or touches intelligence layer          |
