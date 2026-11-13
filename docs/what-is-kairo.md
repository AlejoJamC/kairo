# What Kairo is today

*A plain-language description of what Kairo does and how it does it. Written for people who don't read code. The end says which parts work in every account, which are switched on by configuration, and which are still being built.*

🇪🇸 [Versión en español](que-es-kairo.md)

---

## In short

Kairo puts a company's support email in order, learns the business, and helps the team answer well.

The company connects its Gmail inbox. Kairo reads every email that arrives, sets aside what is not a matter to attend to, and turns the rest into **tickets**. For each ticket it says what kind of matter it is, how serious it is, how much time there is to act, and what mood the customer is writing in. With that it orders the inbox, so whoever opens it knows where to start.

The team replies from Kairo, and the reply goes out from the company's own Gmail, in the customer's thread. Meanwhile Kairo keeps what the company knows: how it resolves each kind of case, which policies it applies, what has happened with each customer. That knowledge comes back when a similar case arrives.

Two rules hold up everything else:

- **The AI proposes and a person decides.** Kairo acts alone only where it has proven it gets things right, and a correction takes that permission away.
- **A correct answer is worth more than a fast, wrong one.** Kairo does not invent solutions, and no reply it drafts goes out before someone has reviewed it.

---

## The problem it solves

In many companies, support lives in a shared mailbox. The password gets passed around, the customer list sits in a spreadsheet someone forwards, and each person answers as best they can, sometimes from a model reply a colleague sent them. It works until an email is left without an owner, or two people tell the same customer different things.

The biggest loss is the one nobody sees. Every resolved case teaches something about the business and about the customer, and that lesson is kept nowhere. The next case starts from zero.

Kairo puts that work in one place, gives it an order, and keeps what was learned.

---

## Who it is for

Small and medium companies that serve their customers by email, starting in Colombia. It works the same at three moments in the life of one company:

- **The owner who answers alone.** Every ticket comes to them, already in order.
- **The small team.** Each person signs in with their own user, and tickets are shared out in turns.
- **The team with a support lead.** Whoever answers for the service sees what is on time and what is slipping.

---

## How it works

Handling an email is four jobs: reading it, understanding what the customer needs, deciding how urgent it is, and replying. Kairo does the first three and helps with the fourth.

| Step | Who does it | What happens |
|---|---|---|
| **1. Read** | Kairo | Checks the inbox, leaves out what is not a matter to attend to, and creates one ticket per conversation |
| **2. Understand** | Kairo | Says what kind of matter it is, its priority, its urgency and the customer's mood, with a short explanation |
| **3. Order** | Kairo | Puts first what cannot wait and gives every ticket an owner |
| **4. Reply** | The team | Replies with the case already understood, and with similar cases and knowledge at hand |

The next four sections explain each step.

---

## 1. Kairo reads the email

### Connecting the inbox

A person creates an account with Google or with email and password. The first one to sign up becomes the **owner** of the company's workspace. Kairo handles the usual cases on its own: someone coming back, someone who already has an account under the same email, and someone who was invited to a team that already exists.

The owner then authorises Kairo on Google's permission screen. Kairo asks for two permissions: to read the inbox and to send email from it. It cannot delete or modify emails.

Gmail is the only channel today.

### The first pass over the inbox

As soon as the inbox is connected, Kairo goes through it in three stages. The pass happens once per company.

| Stage | Which mail | How | Is anyone watching? |
|---|---|---|---|
| **First** | The 30 most recent emails | One after another, newest first, so the inbox is not empty | Yes. The person is in the setup wizard |
| **Second** | The last 15 days | In the background | No |
| **Third** | Older mail, back to about three months | Later, in batches | No |

That difference matters further on: Kairo allows itself less when nobody is watching.

### Every day after that

- Kairo checks every connected inbox every five minutes.
- Whoever is working the queue can press **Sync Gmail** to check right away.
- The inbox updates on its own. New tickets and status changes appear without reloading the page.

### Which mail stays out of the inbox

Before any AI is used, a set of fixed rules decides whether an email comes in. They are applied in this order:

1. **Spam.** If the mail server already marked it as spam, Kairo believes it. On internal tests that signal was as accurate as the AI models, instantly and at no cost.
2. **Replies and urgent subjects always come in.** A reply inside an existing conversation, or an email with an urgent subject, is never dropped by the rules that follow.
3. **Automated senders.** "No-reply" addresses and bulk mail from outside.
4. **Calendar invitations and system receipts.**
5. **Gmail's Promotions and Social tabs.**
6. **Auto-generated mail.**

Every email that stays out is stored with its reason, so it can be reviewed later. Nothing is dropped silently.

Mail between the company's own addresses does go through classification. It used to be dropped, and that hid almost all internal mail from Kairo.

### When the AI service fails

- Each email gets several attempts, with growing pauses between them.
- If many fail in a row, Kairo assumes the service is down and stops sending it work for that run.
- Every 30 minutes it retries the emails that failed for a temporary reason.
- No email is lost because of a failure.

---

## 2. Kairo understands each email

### What kind of matter it is

Kairo does not ask the AI to pick a label. It asks two simple questions that the AI answers reliably:

1. **If nobody answers this email, is something left undone?**
2. **What is it about?** There are four possible answers:
   - the service the company provides to its customers;
   - someone who wants to **buy from** the company;
   - someone who wants to **sell to** the company;
   - the company's own administration (hiring, paperwork, alerts from its systems).

It then combines the two answers with **where the email came from** (outside, another company address, or the connected inbox itself) using a fixed table. The result is the **ticket type**:

| Type | What it means |
|---|---|
| **Support** | A customer matter about the service. This is what the inbox exists for |
| **Prospect** | Someone who wants to become a customer: a quote request, an invitation to bid |
| **Internal** | The company's own matters |
| **Other** | Vendor offers, advertising, event invitations |

Kairo does it this way for a measured reason. When asked for the label directly, the AI mixed the two questions up, and confused buyers with sellers most of all. A fixed table gives the same answer every time, and anyone can check it.

### What the company does

To answer the second question, the AI needs to know what the company does. The same email can be a customer problem for one business and a supplier pitch for another.

That description is written in the last step of the setup wizard or in **Settings › Workspace**. Kairo can also propose it from the first emails, for a person to approve.

Kairo classifies by what the sender asks for, not by industry. It has to work the same for a logistics company, a clinic or a software business.

### How serious, how urgent, and in what mood

For each email the AI also returns:

- **Priority (P1, P2 or P3):** how serious it is. P1 means a loss, a breach or a blockage has already happened, or the customer has asked for the same thing several times without an answer.
- **Urgency (high, medium or low):** how much time is left to act. It is measured apart from priority, because a serious case whose outcome is already settled is important without being urgent.
- **Category:** delivery of the service, money (billing, refunds), access and accounts, general information, or not applicable.
- **Tone:** aggressive, frustrated, neutral or positive. Frustration is measured by insistence, not politeness. A courteous email from someone chasing the same issue for the third time counts as frustrated.
- **An explanation** of one or two sentences, in the email's language.
- **A confidence score** from 0 to 1. Kairo stores it but does not use it to decide: measurements showed that number does not separate right answers from wrong ones.

The AI's instructions exist in Spanish and English. The language is set per company, and Spanish is the default.

### When a classification stands

Every classification is stored as a **proposal**, in one of two states: *approved by the AI* or *to review*.

- **In the first stage of the first pass**, only **Support** emails stand without review. On internal tests Kairo got that type right between 92% and 97% of the time. The other types wait for a person, because there the costly mistake is hiding a real customer request.
- **In the second and third stages**, which run with nobody watching, a type stands only if the company has already **earned** it: 90% accuracy over at least 30 reviews, measured on the 50 most recent reviews of that type. Kairo must also know what the company does.
- **Kairo can ask a second AI model for a second opinion.** If the two disagree on the type, the ticket always waits for a person.

The **AI Classification** view shows proposals in two tabs, *To review* and *Approved by the AI*. Confirming or rejecting a proposal is what teaches Kairo when it can stop asking.

---

## 3. Kairo orders the inbox

### The order

Each ticket gets a score between 0 and 1 that combines four factors:

| Factor | Default weight | Idea |
|---|---|---|
| Ticket type | 30% | Support scores high; internal and other score low |
| Customer's plan | 35% | Enterprise above Pro above Starter; a customer with no plan is capped |
| Sender's mood | 20% | Aggressive and frustrated above neutral and positive |
| Time waiting | 15% | Grows over the first 48 hours |

A customer who has written five or more times in the last 30 days gets an extra boost. The inbox is sorted by that score, then by P1, P2 and P3, then oldest first.

### Response-time targets

Each company sets four times for P1, P2 and P3: the maximum for the first reply, a minimum, a warning point and an escalation point. Every ticket shows how much time is left or how overdue it is. The customer card shows how many of that customer's past tickets went over time.

There is a second, separate level that comes from the **customer's contract** and is set in the customer directory. The two are kept apart on purpose: one depends on how urgent the ticket is, the other on what the customer paid for.

### Who answers each ticket

Every new ticket arrives with an owner. Kairo assigns it in turns among the team's active members, starting with whoever has gone longest without one. If the company has a single member, every ticket goes to that person.

### The views

| View | What it shows |
|---|---|
| **Triage** | The active inbox: new, in-progress and reopened tickets |
| **Awaiting Reply** | Tickets the team already answered and the customer has not replied to |
| **Escalated** | Escalated cases, apart from the inbox |
| **Resolved** | Closed tickets, read-only |
| **AI Classification** | Kairo's proposals, to review and approved |
| **Knowledge** | What Kairo proposes to keep and what the company has already published |
| **Clients** | The customer directory |
| **Settings** | The workspace, the team, the response-time targets and the Gmail connection |

The sidebar shows a count next to each ticket view, and a search box that also runs actions.

---

## 4. The team replies

### Inside a ticket

- **The full conversation**, with the customer's messages, the team's replies and internal notes in one thread.
- **Reply.** The reply goes out from the company's Gmail, inside the original conversation, in a branded email design. Kairo shows whether it is sending, sent or failed. If the Gmail connection has expired, it asks to reconnect and the text is not lost.
- **Send & resolve.** Replies and closes the ticket in one step.
- **Quick actions:** take the ticket, resolve it or escalate it, with an optional reason.
- **"Wrong classification?"** Whoever is handling the ticket corrects the type, priority, category or tone. The correction is saved next to what the AI said and the ticket is marked *Corrected*. These corrections are how Kairo measures its accuracy for each company.

### Help with the reply

- **Templates.** Saved text for common answers, with placeholders such as the customer's name.
- **Similar cases.** Resolved tickets that look like this one, with how they were resolved. One click puts that resolution into the reply.
- **Articles.** Published knowledge related to the ticket, which can also be put into the reply.
- **Client.** Who the customer is, their plan, how many tickets they have sent, their recent cases and their record against the targets.
- **Assistant.** A conversation about the ticket. It can inspect the case and prepare a proposed reply. When inserted, the text lands in the reply box marked *AI draft*, and can be edited before sending.

Kairo's drafts follow five rules:

1. It does not invent information that is not in the case or in approved knowledge.
2. Every fact, policy, deadline or commitment needs support. A similar case is an example, not proof.
3. It does not say something was checked, sent or resolved unless the conversation records it.
4. If there is no supported solution, it acknowledges the request and asks only for what is missing.
5. A draft always needs a person's approval.

### Working as a team

- **Internal notes.** Comments inside the ticket that the customer never sees.
- **Mentions.** Typing **@** notifies a teammate inside the app, never by email. A bell shows activity, unread items and mentions.
- **Escalate.** Kairo suggests reasons to escalate and a level: a target at risk, an Enterprise customer waiting too long, repeated frustration, a repeated error, or a similar case that needed a higher level before.
- **Group.** Several tickets about the same problem can be grouped, and Kairo suggests groups when it spots them.

### The life of a ticket

A ticket arrives **open**. From there it can move to **in progress**, be left **awaiting the customer** after a reply, be **escalated** or be **resolved**. When the customer writes back:

- a ticket awaiting their reply goes back to **in progress**;
- a resolved ticket is **reopened**;
- a reply to a permanently **closed** ticket does not reopen it, but it is recorded.

There is a status reserved for "resolved by the AI", but nothing sets it today. Kairo does not resolve tickets on its own.

Every change of status, every classification and every correction is kept in a permanent history that cannot be edited, with who or what made it. For any decision you can find out what produced it, and which version of the rules and AI instructions was in use.

---

## Kairo learns the business

This is the part that sets Kairo apart. What the team learns while serving customers stops getting lost.

### What it keeps

Kairo proposes four kinds of knowledge:

| Kind | Example |
|---|---|
| **Business fact** | What the company sells, which cities it delivers to |
| **Policy** | How a refund is handled |
| **Exception** | A different arrangement with one particular customer |
| **Article** | How a case was resolved, written up to be used again |

Proposals come from three places: the emails of the first pass, from which Kairo drafts the **business profile**; the mail that keeps arriving; and the tickets the team resolves.

### Who approves it

Every proposal is a draft until a person publishes it. Each one comes with its **source**, the quote from the email it came from, and with a validation. Kairo flags the proposal when the quote does not match the source, when the source does not support everything that is claimed, or when it contradicts something the company already approved.

The **Knowledge** view has two tabs, *Drafts* and *Published*. The team edits, publishes or discards. What Kairo does not know yet, the company can write in.

### How it is used again

Only published knowledge is used again. It appears in each ticket's related articles, in the assistant's answers and in drafts, always with the reference to where it came from.

Inside the ticket, the **Decisions and evidence** panel lists every decision the AI made about that case, the sources it used and what evidence was missing.

### How autonomy is earned

Kairo also learns from corrections. Each time someone confirms or rejects a classification, there is a measure of how well Kairo gets that ticket type right for that company. When the measure passes the threshold, Kairo stops asking for that type. If it starts getting it wrong, it asks again. Nobody grants that permission by hand.

---

## The company, its team and its customers

- **Each company on its own.** One company's data is separated from every other company's in the database.
- **Everyone with their own user.** Nobody shares the mailbox password. There are four roles: owner, admin, supervisor and agent. Today all four can perform every day-to-day action on a ticket. Only the owner and the admin change the company's description.
- **Invitations.** A person is invited with a link. The team list is shown in Settings.
- **Customer directory.** Companies with their ID, phone, plan, contractual response-time level, the email addresses allowed to write on their behalf, and their contact people.
- **Detected contacts.** Kairo can propose new contacts it finds in incoming email. It leaves out the company's own addresses and anyone only copied on bulk mail. Emails and phone numbers are brought to a standard format so the same person is not counted twice.
- **Plans.** The product records Starter, Pro and Enterprise, each with a seat limit.

---

## What Kairo sends to customers

The AI never sends anything by itself. Every message to a customer is written and sent by a person, or is one of these fixed emails:

| Email | When it goes out |
|---|---|
| **Team reply** | When someone presses Send |
| **Resolved** | When someone presses Send & resolve |
| **Out-of-hours notice** | When a new ticket arrives outside support hours. Only for mail that just arrived, and once per conversation. If the company has not set its hours, the default is Monday to Friday 8:00 to 18:00 and Saturday 8:00 to 12:00, Bogotá time |
| **Acknowledgement** | "We received your request", with the ticket number. When it is switched on it replaces the out-of-hours notice, so the customer never gets two automatic emails |

Every outgoing email carries the ticket reference in the subject, so replies stay in the same thread.

---

## The principles behind Kairo

1. **The AI proposes, a person decides.** Autonomy is earned per company and per ticket type, from measured accuracy, and it can be lost.
2. **The AI does not send email or resolve tickets on its own.**
3. **It does not invent.** What Kairo drafts or proposes to keep needs support in the case or in approved knowledge.
4. **Knowledge is published by a person.** What Kairo derives is a draft until someone approves it.
5. **The cheapest reliable signal comes first.** If a fixed rule or the mail server already knows the answer, no AI is used.
6. **The AI is asked only what it answers well.** Two simple questions and a fixed table are more consistent than one complex label.
7. **The confidence the AI reports decides nothing.** What counts is accuracy measured against people's decisions.
8. **Nothing is dropped silently.** Filtered mail keeps its reason, failed mail is retried, and a customer writing to a closed case is recorded.
9. **Everything can be traced.** Every decision is stored with its inputs and the version of the rules that made it.
10. **Seriousness and urgency are different things**, and each is measured on its own.
11. **Replies stay in the customer's email**, sent from the company's own address.
12. **What is internal does not reach the customer.** Notes and mentions exist only inside the app.

---

## What works, what is switched on, and what is still being built

Kairo ships every new feature behind a switch and turns it on in each environment when it is ready. That is why an account may not see everything this document describes.

### Works in every account

Sign-up and the Gmail connection · the first pass and the check every five minutes · the filtering rules · classification · the ordered inbox · response-time targets by priority · Reply and Send & resolve · templates · assignment in turns · correcting a classification · the AI Classification view · escalation · the out-of-hours notice · the customer directory · the permanent history.

### Has its own switch

| Feature | What it takes to see it |
|---|---|
| Knowledge from incoming mail and the business profile | One switch on the server |
| Articles from resolved tickets | Another switch on the server |
| The ticket assistant | One switch on the server and one in the dashboard |
| Side-panel tabs: client, similar, articles, escalate, notes and assistant | One switch per tab |
| Internal notes, ticket grouping, "Assign to me" and related history | One switch each |
| The acknowledgement email | One switch on the server |
| Detected contacts | One switch on the server |
| Alerts when a ticket crosses its escalation point | One switch on the server |
| The measurement that awards auto-approval per type | One switch on the server |
| The second AI model | One switch for the second opinion, another to let it confirm classifications for a chosen mailbox |
| The live detection step in the setup wizard | One switch on the server. Without it, the wizard goes straight to the end |

### Still being built

- **Other channels.** Only Gmail exists.
- **Billing and payments.** There are no charges or usage limits.
- **Automatic resolution of tickets.**
- **Sending invitations from the dashboard.** Today a person is invited by link.
- **Confirming, rejecting or editing a detected contact** from the dashboard.
- **A screen to tune the ordering weights.** Today they are changed per company directly in the system.
- **In Settings:** the *Triage* section (tiers, confidence threshold, categories) is a mock-up, and changing it has no effect. *Billing* and *API* are marked under construction. Two-factor login is marked coming soon.
- **The initial rules in the setup wizard** are not saved. The organisation name, the industry and the company description are.
- **The assistant's starter buttons** return sample answers.
- **The satisfaction survey and the escalation notice to the customer** are designed, but nothing sends them yet.
- **The mobile app** is a placeholder screen.

---

## Where the published website says more than the product does

The website describes where Kairo is heading. For anyone explaining the product, these are today's differences:

- **Channels.** The website lists WhatsApp, Instagram, Telegram and Slack as coming soon. Only Gmail exists.
- **Privacy.** The privacy policy and the connection screen say Kairo only reads and never sends. The product sends the team's replies and the out-of-hours notice.
- **Automatic resolution.** The website talks about resolving tickets above a confidence threshold. Kairo keeps spam out of the inbox, but it does not resolve tickets.
- **Plans and pricing.** The website shows Free, Pro, Scale and Enterprise with prices and limits. The product records Starter, Pro and Enterprise and does not charge.
- **Features for large companies.** Single sign-on, self-hosting, API, webhooks and Slack alerts are not built.
- **Speed and language.** "First prioritised ticket in under 60 seconds" is a design goal. The AI's instructions exist in Spanish and English, with no regional variants.

---

## How Kairo is watched

Every AI call is recorded: what was asked, what it answered, how long it took, what it cost, and which ticket and company it belonged to. So is every automatic decision: filtering, ticket type and approval. Today those tools run on the Kairo team's own machines.

There is also an **evaluation bench**. Hand-labelled sets of real emails go through the same steps production uses, and the team measures how often Kairo gets each field right. Several decisions in this document came out of those measurements: believing the spam filter, splitting buyers from sellers, and approving only Support without review at first.

---

## Other applications

- **Public website:** home page, pricing, privacy, terms, login and the setup wizard, in Spanish and English.
- **Dashboard:** in Spanish and English, with a switch in the sidebar.
- **Desktop app:** the same dashboard, packaged as an application.
- **Kelan:** an internal tool for the Kairo team, with restricted access. It is not for customers.

---

## Glossary

- **Workspace or account:** one company using Kairo, with its users, its inboxes and its data.
- **Ticket:** a customer matter, created from one or more emails in the same conversation.
- **Ticket type:** support, prospect, internal or other. Spam is filtered before a ticket exists.
- **Priority (P1 to P3):** how serious a case is.
- **Urgency:** how much time is left to act.
- **Score:** the 0-to-1 number used to order the inbox.
- **Proposal:** what the AI suggests, either a classification or a piece of knowledge. It is either approved or waiting for review.
- **Knowledge:** a business fact, a policy, an exception or an article that Kairo proposes and a person publishes.
- **Business profile:** the short description of what the company does. The AI needs it to classify.
- **Response-time target:** the maximum time for the first reply, set per priority.
- **Escalation:** handing a case up for priority attention.
- **Internal note:** a comment only the team can see.
