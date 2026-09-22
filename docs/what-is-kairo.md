# What Kairo is today

*A plain-language picture of the product as it is actually built right now. Written for people who don't read code. It describes what works today, what is built but switched off, and what is shown on screen but not real yet.*

🇪🇸 [Versión en español](que-es-kairo.md)

---

## In one paragraph

Kairo is a workspace for customer support teams whose support arrives by email. You connect a company Gmail inbox, and Kairo reads every incoming email, drops the junk, and turns the rest into **tickets**. For each ticket it decides what the email is (a customer request, a sales lead, internal mail, something else), how important and how urgent it is, and what mood the sender is in. It then ranks the whole queue so that whoever opens it sees at a glance what to handle first. Agents reply to customers from inside Kairo (the reply goes out from the company's own Gmail, in the same email thread), leave private notes for colleagues, escalate hard cases, and correct Kairo when it gets a call wrong. The core idea is **trust earned step by step**: the AI proposes, a person decides, and the AI only acts alone where it has proven reliable. Today that autonomy is deliberately small.

---

## Who it is for

- **Support teams** at small and medium companies who get more email than they can read, starting with Spanish-speaking teams.
- **The agent** who works the queue every day.
- **The supervisor or owner** who needs to know nothing urgent is being missed and that response times are being met.

---

## The journey, from sign-up to daily use

### 1. Signing up

A new user creates an account with Google or with email and password. The first person to sign up becomes the **owner** of a new company workspace (Kairo calls it an *account*). Kairo handles the usual cases automatically: someone returning, someone who already has an account under the same email, someone who was invited to join an existing team, and a brand-new user.

A short setup wizard then asks for the organisation's name.

### 2. Connecting the inbox

Gmail is the only channel today. The owner grants Kairo access to the Gmail inbox through Google's standard permission screen. From that moment Kairo can read the inbox and, when an agent chooses to reply, send email from it.

### 3. The first look at the inbox

Right after connecting, Kairo runs a staged first pass so the team gets value quickly:

1. **Fast first ticket.** The most recent email is classified immediately, so the cockpit is not empty.
2. **The last two weeks** are classified in the background.
3. **Older mail, up to about three months back**, is processed later, in batches.

This first pass happens once per company. It is never repeated on later logins.

### 4. Every day after that

- Kairo checks every connected inbox for new mail **about every five minutes** and processes it the same way.
- Agents can press **Sync** to force an immediate check.
- The queue updates **live**: new tickets and status changes show up without refreshing the page.

---

## How Kairo reads an email

This is the heart of the product. Each incoming email goes through the steps below.

### Step 1 — Should this be a ticket at all?

Before any AI is involved, a set of fixed rules decides whether the email belongs in the queue. The rules are applied in a set order:

- **Spam.** If the receiving mail server already marked the email as spam, Kairo believes it. This is instant, free, and on Kairo's internal tests it was as accurate as the AI models, and far faster.
- **Replies and urgent subjects always get through.** A reply inside an existing conversation is never dropped by the rules below.
- **Automated senders, system notifications, auto-generated mail and Gmail's promotional tabs** are kept out of the queue.

Every email that is kept out is stored with the reason it was kept out, so it can be reviewed later. Nothing is silently lost.

Emails sent between the company's own addresses are **not** thrown away anymore. They used to be. It turned out that throwing them away hid most of the company's internal mail from the system, so they now go through classification like everything else.

### Step 2 — What is this email?

The AI reads the email (subject, sender, recipients, how deep into a conversation it is, the names of any attachments, and the body without the quoted history) together with two facts about the company: **which mailbox is being read** and **what the company does**, as a short description. That second fact matters. The same email can be a customer problem for one business and a supplier pitch for another.

Instead of asking the AI to pick a label straight away, Kairo asks it two simpler questions it answers reliably:

1. **Does this need someone to act?** Or is it only informative?
2. **What is it about?** One of four answers:
   - the service the company provides to its customers;
   - someone who wants to **buy from** the company;
   - someone who wants to **sell to** the company;
   - the company's own administration (hiring, paperwork, compliance, alerts from its own systems).

Kairo then combines those two answers with **where the email came from** (outside the company, another company address, or the connected inbox itself) using a fixed table. The result is the **ticket type**:

| Ticket type | What it means |
|---|---|
| **Support** | A customer matter about the service. This is what the queue exists for |
| **Prospect** | Someone who wants to become a customer (a quote request, an invitation to bid) |
| **Internal** | The company's own housekeeping |
| **Other** | Vendor offers, advertising, event invitations |
| **Spam** | Only ever set by the spam rule in step 1, never by the AI |

Kairo decides the type this way, and does not ask the AI to guess it directly, for a reason. When the AI was asked directly, it mixed up two separate questions and gave inconsistent answers. It confused buyers with sellers most of all. A fixed table gives the same answer every time, and anyone can check it.

### Step 3 — How important, how urgent, what mood

The AI also returns:

- **Priority (P1 / P2 / P3):** how serious the case is. P1 means a loss, breach or blockage has already happened, or the customer has asked several times without an answer.
- **Urgency (high / medium / low):** how much time is left to act. Urgency is kept separate from priority on purpose: a very serious case whose outcome is already settled can be important without being urgent.
- **Category:** delivery of the service, money (billing, refunds), access and accounts, general information, or not applicable. "Technical" means *the service itself was not delivered well*, whatever the company sells. It is not limited to IT problems.
- **Tone:** aggressive, frustrated, neutral or positive. Frustration is judged by **insistence**, not politeness: a courteous email from someone chasing the same issue for the third time counts as frustrated.
- **A one- or two-sentence explanation** of the decision, in the email's language.
- **A confidence score** from 0 to 1.

### Step 4 — A second opinion (optional)

Kairo can be set up to ask a **second, different AI model** the same questions. If the two disagree on the ticket type, Kairo does not let either answer stand on its own. The ticket goes to a person.

### Step 5 — Does the decision stand, or wait for a person?

Every classification is stored as a **proposal** with one of two outcomes: *approved automatically* or *waiting for a person*. The rules today are deliberately cautious:

- During the first inbox scan, only **Support** emails are approved automatically, because Kairo's internal tests showed that call to be right well over 90% of the time. Every other type waits for a person. Here the risky mistake is hiding a real customer request, so Kairo doesn't take that risk.
- For all other mail, a type can only be approved automatically once the company has **earned** it. The type must reach a measured accuracy (90% by default) over a minimum number of cases (30 by default), and Kairo must know what the company does. The rules for this are in place, but the automatic measurement that would switch it on is not running yet. **In practice, those classifications currently wait for a person.**
- If the two AI models disagreed, the ticket always waits for a person.

### Languages

Kairo's AI instructions exist in **Spanish and English**. The language is a setting for each company. Spanish is the default.

### When the AI service fails

- Each email gets several attempts, with growing pauses between them.
- If many emails in a row fail, Kairo assumes the AI service is down and stops sending it more work for that run, instead of piling up errors and cost.
- Every 30 minutes, emails that failed for a temporary reason are retried automatically. Emails that can never succeed are marked as such, with their content saved.
- No email is lost because of a failure.

---

## How the queue is ordered

Each ticket gets a **priority score** between 0 and 1 that combines four things:

| Factor | Default weight | Idea |
|---|---|---|
| Ticket type | 30% | Support ranks high; internal and other rank low |
| Customer's plan | 35% | Enterprise above Pro above Starter; customers with no plan are capped |
| Sender's mood | 20% | Aggressive and frustrated rank above neutral and positive |
| Time waiting | 15% | Grows over 48 hours |

Customers who have written five or more times in the last 30 days get an extra boost. Each company can adjust these weights.

The queue is sorted by this score, then by P1/P2/P3, then oldest first.

### Response-time targets by priority

Each company sets, for P1, P2 and P3, a maximum time for the first reply, a minimum time, a warning point and an escalation point. The time counts 24 hours a day, 7 days a week. Every ticket shows how much time is left or how overdue it is, and the customer card shows how many of a customer's past tickets went over time.

There is also a separate, older response-time level that comes from a **customer's contract**, set in the customer directory. The two are kept apart on purpose: one depends on how urgent the ticket is, the other on what the customer paid for.

---

## Working a ticket: the cockpit

### The main views

- **Triage:** the active queue (new, in progress, and reopened tickets).
- **Awaiting reply:** tickets where an agent answered and the customer hasn't replied yet.
- **Escalated:** cases that were escalated and need priority attention.
- **Resolved:** closed tickets, read-only.
- **Clients:** the customer directory.
- **Settings.**

The sidebar shows a live count for each view.

### What each ticket card shows

Priority, the time left against the response-time target (or how overdue it is), the sender's mood, the AI's confidence, how long ago it arrived, and whether it has been grouped with similar tickets.

### Inside a ticket

- **The full conversation**, with customer messages, agent replies and internal notes in one thread.
- **Reply.** The agent writes a reply and sends it. It goes out from the company's Gmail **inside the original email conversation**, wrapped in a branded email design. Kairo shows whether it is sending, sent or failed. If the Gmail connection has expired, it asks the agent to reconnect, and the text is never lost.
- **Send & resolve.** Replies and closes the ticket in one step, using a "resolved" email design.
- **Quick actions:** acknowledge (take the ticket), resolve, escalate (with an optional reason).
- **Reply templates.** Ready-made text snippets for common answers, with placeholders such as the customer's name.
- **"Wrong classification?"** The agent can correct the type, priority, category or mood, with an optional note. The correction is saved alongside what the AI originally said, and the ticket shows a "Corrected" badge. These corrections are how Kairo measures its own accuracy for each company.
- **Side panel** (tabs that can be switched on or off):
  - **Client:** who the customer is, their plan, how many tickets they have sent in total and this month, whether they are a returning customer, recent tickets and their record against response-time targets.
  - **Similar:** past resolved cases that look like this one, with how they were resolved. One click puts a past resolution into the reply.
  - **Articles:** related knowledge-base articles, which can also be put into the reply.
  - **Escalate:** reasons Kairo suggests for escalating (response-time target at risk, enterprise customer waiting too long, repeated frustration, a repeated technical error, a similar case that needed a higher level before), with a suggested level.
  - **Notes:** the ticket's internal notes.

### Internal notes and @mentions

Agents can write **internal notes** on a ticket that the customer never sees. Typing **@** mentions a teammate, who gets an in-app notification (never an email). A bell in the top bar shows activity, unread items and mentions.

### Grouping and related history

Agents can select several tickets and **group** them when they are about the same issue. Kairo also suggests groups on its own. A **related history** drawer shows similar past cases.

### How a ticket moves through its life

A ticket is **open** when it arrives. From there it can be taken (**in progress**), answered and left **awaiting the customer**, **escalated**, or **resolved**. When a customer writes back:

- a ticket awaiting their reply goes back to **in progress**;
- a resolved ticket is **reopened**;
- a reply to a permanently **closed** ticket does not reopen it, but it is recorded, so it doesn't disappear.

There is also a status reserved for "resolved by the AI", but **nothing sets it today**. Kairo does not resolve tickets on its own.

Every change of status, every classification and every correction is kept in a **permanent history that cannot be edited**, with who or what made it, and the database itself refuses status changes that break these rules. For any decision you can find out what made it, and which version of the rules and AI instructions was in use.

---

## Automatic emails to customers

| Email | Status today |
|---|---|
| **Out-of-hours auto-reply:** sent when a new ticket arrives outside the company's support hours | **Always on.** Each company can set its own hours; if none are set, a default Monday–Saturday daytime schedule applies. It only fires for fresh email (not for old mail picked up by a sync) and only once per conversation |
| **Agent reply** (branded design) | On |
| **Resolved** (branded design, used by "Send & resolve") | On |
| **"We received your request"** acknowledgement with the ticket number | Built, **switched off** by default. When on, it replaces the out-of-hours reply so the customer never gets two automatic emails |
| **Satisfaction survey** | Designed, **never sent** (nothing triggers it yet) |
| **Escalation notice** | Designed, **never sent** |

Every outgoing email carries a ticket reference in the subject, so replies thread correctly. **The AI never sends anything by itself.** Every message to a customer is either written and sent by a person, or one of the fixed automatic emails above.

---

## Customers and contacts

- **Client directory:** companies with an internal ID, legal ID, phone, plan, contractual response-time level, the email addresses allowed to write on their behalf, and contact people. You can create, edit and delete them.
- **Auto-detected contacts:** Kairo can propose new contacts it finds in incoming email, as *drafts* for a person to confirm or reject. It leaves out the company's own addresses and people only copied on mass emails. This detection is built but **switched off by default**, and the confirm, reject and edit actions on drafts are not finished yet.
- Email addresses and phone numbers are cleaned up to a standard format, so the same person isn't counted twice.

---

## Teams, companies and permissions

- **Many companies on one platform.** Each company's data is fully separated from every other company's at the database level.
- **Roles:** owner, admin, supervisor, agent. Today all four can perform every day-to-day ticket action; only a permanent close is reserved for the system. The permission rules are set up so they can be tightened later with a small change.
- **Invitations:** owners and admins can invite people by link. The invite page works, but there is no invite button in the dashboard yet.
- **Plans** in the product's own records: Starter (default), Pro and Enterprise, each with a seat limit. There is **no billing or payment** in the product yet.

---

## Keeping an eye on the system

The team behind Kairo can watch it closely. Every AI call (what was asked, the answer, how long it took, the cost, which ticket and company it belonged to) and every automatic decision (routing, ticket type, auto-approval) is recorded in two monitoring tools, with ready-made dashboards. Today these tools run on the team's own machines rather than as a hosted production service.

The team also keeps an **internal evaluation bench**: it runs a hand-labelled set of real emails through the same steps production uses and measures how often Kairo gets each field right. Many of the design choices above, such as trusting the spam filter, splitting buyers from sellers and only auto-approving Support at first, came straight from those measurements.

---

## Other parts of the product

- **Public website:** home page, pricing page, privacy policy, terms of service, login, sign-up and the setup wizard, in English and Spanish.
- **Internal admin console (Kelan):** a separate tool for the Kairo team, not for customers. Today it has a secure login restricted to authorised staff. Its dashboard is a placeholder.
- **Mobile app:** a placeholder screen only.
- **Languages in the dashboard:** English and Spanish, following the browser's language.

---

## Key decisions behind the product

1. **The AI proposes, a person decides.** Autonomy is granted per company and per ticket type, based on measured accuracy. Nobody sets it by hand, and it can be withdrawn.
2. **The AI never sends email and never resolves tickets on its own.**
3. **Use the cheapest reliable signal first.** If a fixed rule or the mail server already knows the answer (spam, automated senders), no AI is used.
4. **Ask the AI only what it answers well.** Two simple questions plus a fixed table are more consistent than one complex label.
5. **The AI's self-reported confidence is not trusted to decide.** Measurements showed it does not separate right answers from wrong ones. What counts is accuracy measured against people's decisions.
6. **Classify by what the sender asks, not by industry.** Kairo has to work for a logistics company, a clinic or a software business alike, so it is told what each company does.
7. **Everything can be traced.** Every decision is stored with its inputs and the version of the rules that made it, and ticket history can never be rewritten.
8. **Nothing is silently dropped.** Filtered mail keeps its reason, failed mail is retried, and a customer writing to a closed case is recorded.
9. **Importance and urgency are different things**, and each is measured on its own.
10. **Replies stay in the customer's email conversation**, sent from the company's own address.
11. **Internal notes never reach the customer**, and mentions only notify inside the app.
12. **Risky features ship switched off** and are turned on per environment once they are ready.

---

## Built, but switched off by default

- The **"we received your request"** acknowledgement email.
- **Auto-detected contacts** from incoming email.
- **Automatic in-app alerts** when a ticket crosses its escalation point for response time.
- The live **"detection" step** in the setup wizard.
- On the dashboard, each of these can be switched on or off: the side-panel tabs (client, similar, articles, escalate, assistant), **ticket grouping**, **"Assign to me"**, and the entire **internal notes** feature.
- The **second AI model** for a second opinion.

---

## On screen, but not real yet

These parts of the product are designs or simulations, not working features:

- **The AI assistant chat** in the side panel. Its answers are scripted examples; it does not call an AI yet.
- **AI-drafted replies.** The system can generate a suggested reply from similar cases and the knowledge base, but the dashboard doesn't request or show them yet. Today the agent can only insert a past resolution or an article.
- In **Settings**, the team list, the connected-tools list and the *Triage Engine* section (tiers, auto-resolution threshold, custom categories) are illustrations: changing them has no effect. *Knowledge Base*, *Billing* and *API & Webhooks* are marked "under construction". Two-factor login is "coming soon". What does work in Settings: the workspace name, response-time targets by priority, the Gmail connection and password management.
- The **"In progress"** view is a placeholder.
- The **triage toggles in the setup wizard** (auto-classify, draft replies, auto-resolve spam, prioritise paid plans) are not saved. Only the organisation name is.
- The **company description** that the AI relies on has no screen yet. It is set directly in the system.
- There is **no screen to review** the classifications that are "waiting for a person". Today people review them by correcting tickets.
- The **Kelan dashboard** and the **mobile app**.

---

## Where the public website says more than the product does

The website describes where Kairo is heading, not only what it does today. For anyone explaining the product, these are the differences:

- **Channels:** the website mentions Slack, WhatsApp, Telegram and Instagram. Only Gmail exists.
- **Auto-resolution:** the website and settings describe spam being archived automatically and tickets resolved above a confidence threshold. Kairo keeps spam out of the queue, but **does not resolve tickets** on its own.
- **Privacy wording:** the privacy policy and the Gmail connection screen say Kairo never sends email and is read-only. In the product, agents send replies from Kairo, and the out-of-hours auto-reply is always on.
- **Plans and pricing:** the website shows Free, Pro, Scale and Enterprise with ticket limits and prices. The product records Starter, Pro and Enterprise, and has no billing, usage limits or payments.
- **Enterprise features** such as single sign-on (SAML, SCIM), self-hosting, API and webhooks, Slack alerts, and revenue or satisfaction figures on the client card are not built.
- **Speed and language claims** (first prioritised ticket in under 60 seconds, models tuned for regional varieties of Spanish) are goals. Kairo's AI instructions exist in Spanish and English, with no regional variants.

---

## Glossary

- **Account / workspace:** one company using Kairo, with its own users, inboxes and data.
- **Ticket:** a customer matter created from one or more emails in the same conversation.
- **Ticket type:** support, prospect, internal, other or spam.
- **Priority (P1–P3):** how serious a case is.
- **Urgency:** how much time is left to act.
- **Priority score:** the 0–1 number used to order the queue.
- **Proposal:** the AI's classification, either approved automatically or waiting for a person.
- **Escalation:** handing a case up for priority attention.
- **Internal note:** a comment only the team can see.
- **Response-time target (SLA):** the maximum time allowed for the first reply, set per priority.
