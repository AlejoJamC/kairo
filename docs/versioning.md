# Versioning the decision layers

Two constants carry a version of their own:

| Constant | Where | Governs |
| --- | --- | --- |
| `ROUTING_POLICY_VERSION` | `apps/api/src/lib/email/routing-policy.ts` | Which messages become tickets, and the `skip_reason` written for those that do not |
| `DERIVATION_VERSION` | `packages/intelligence/src/classification/derive.ts` | The table that turns provenance and the model's two axes into a `ticket_type` |

The prompt files use a **different** scheme — see
`packages/intelligence/prompts/README.md` and do not apply this one to them.

## The first number does not move

**While the work is unmerged, the first number stays at 1.** Nothing has
shipped, nothing is persisted, nothing downstream can break, so there is nothing
a major could be warning anyone about.

After it ships, the first number is still not for the ordinary evolution of a
function. A rule that gets better, a table that gets more accurate, a condition
that gets narrower — none of that is a new major, however much work it took or
how much traffic it moves. The first number is for a **different mechanism**,
not a better one: the day routing stops being an ordered table of rules, or the
day `ticket_type` stops being derived from a table at all.

An improvement is never a major. If the answer to "what changed" is "it works
better now", it is not the first number.

## The other two

| Position | When |
| --- | --- |
| **Second** — `1.X.0` | A rule disappears, so a value it used to emit can never be produced again. The vocabulary shrinks |
| **Third** — `1.x.X` | Everything else: a rule added, a condition widened or narrowed, a cell remapped. However many messages move |

The test is about the **vocabulary**, not the traffic. Adding a rule that
reroutes ten messages between reasons that all still exist is a third-position
bump. Deleting a rule that fired on two messages is a second-position bump,
because a string that exists in old rows can now never be written again.

The common error is reaching for the first number because a change felt
significant. Significance is not the question, and neither is effort. Three
changes to the routing policy landed in a single unmerged branch; not one of
them was a major, and the table below says why for each.

## Worked examples — `ROUTING_POLICY_VERSION`

| Change | Version | Why |
| --- | --- | --- |
| The eight rules as they were inside `preFilterEmail` | **1.0.0** | Starting point |
| The same-domain rule is removed | 1.0.0 → **1.1.0** | It was the only emitter of `skip_reason = 'outbound'`. That string can never be written again |
| The provider's spam verdict decides first | 1.1.0 → **1.1.1** | A rule added. Ten messages change route, and `spam_filtered` already existed and still means the same thing |
| `mailing_list` removed; `automated_sender` stops firing on the account's own mailboxes | 1.1.1 → **1.2.0** | `mailing_list` becomes unproducible. The `automated_sender` half is a narrowing and would have been a third-position bump on its own |

## Worked example — `DERIVATION_VERSION`

| Change | Version | Why |
| --- | --- | --- |
| 18 cells over `service \| commercial \| admin` | **1.0.0** | Starting point |
| The commercial value splits by direction; 24 cells, several remapped | 1.0.0 → **1.1.0** | `commercial` stops existing as a key, so a derivation key that was valid can never be formed again. All five `TicketType` values remain producible, which is why it is not more than this |

That second row is the one that catches people out. The table was rewritten, an
axis value disappeared and the model answers a different question — and it is
still a second-position bump, because the column this version exists to explain
is `ticket_type`, and every one of its five values is still reachable. Every row
already stored still means what it said.
