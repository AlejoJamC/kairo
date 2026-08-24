import { describe, it, expect } from "bun:test";
import { parseEml } from "./parse-eml";

// ---------------------------------------------------------------------------
// The parser used to read every header and return four of them. The rest were
// dropped on the way out, including `To` — without which `internal` is not
// decidable, since that class is defined by who sent the mail relative to who
// received it. These tests keep the discarded fields from being discarded
// again.
// ---------------------------------------------------------------------------

function eml(headers: string, body = "Hello"): string {
  return `${headers}\n\n${body}`;
}

describe("recipients", () => {
  it("returns To and Cc", () => {
    const p = parseEml(eml(
      [
        "From: sender@outside.com",
        "To: support@company.com",
        "Cc: ops@company.com, boss@company.com",
        "Subject: Test",
      ].join("\n"),
    ));

    expect(p.from).toBe("sender@outside.com");
    expect(p.to).toBe("support@company.com");
    expect(p.cc).toBe("ops@company.com, boss@company.com");
  });

  it("returns empty strings rather than dropping absent recipients", () => {
    const p = parseEml(eml("From: a@b.com\nSubject: Test"));

    expect(p.to).toBe("");
    expect(p.cc).toBe("");
  });

  it("decodes RFC 2047 encoded recipient names", () => {
    const p = parseEml(eml(
      "From: a@b.com\nTo: =?UTF-8?B?Sm9zw6k=?= <jose@company.com>\nSubject: T",
    ));

    expect(p.to).toContain("José");
  });
});

describe("threadDepth", () => {
  it("is 0 when the email opens the thread", () => {
    expect(parseEml(eml("From: a@b.com\nSubject: New")).threadDepth).toBe(0);
  });

  it("counts the message ids in References", () => {
    const p = parseEml(eml(
      "From: a@b.com\nSubject: Re: X\nReferences: <1@x> <2@x> <3@x>",
    ));

    expect(p.threadDepth).toBe(3);
  });

  it("counts folded References across lines", () => {
    const p = parseEml(eml(
      "From: a@b.com\nSubject: Re: X\nReferences: <1@x>\n <2@x>\n <3@x> <4@x>",
    ));

    expect(p.threadDepth).toBe(4);
  });

  it("falls back to In-Reply-To when References is absent", () => {
    const p = parseEml(eml("From: a@b.com\nSubject: Re: X\nIn-Reply-To: <1@x>"));

    expect(p.threadDepth).toBe(1);
  });
});

describe("attachments", () => {
  it("lists filename and content type", () => {
    const raw = [
      "From: a@b.com",
      "To: c@d.com",
      "Subject: With file",
      'Content-Type: multipart/mixed; boundary="BB"',
      "",
      "--BB",
      "Content-Type: text/plain",
      "",
      "See attached",
      "--BB",
      "Content-Type: application/msword",
      'Content-Disposition: attachment; filename="carta.doc"',
      "",
      "AAAA",
      "--BB--",
    ].join("\n");

    const p = parseEml(raw);

    expect(p.attachments).toHaveLength(1);
    expect(p.attachments[0]!.filename).toBe("carta.doc");
    expect(p.attachments[0]!.contentType).toBe("application/msword");
  });

  it("is an empty array when there are none", () => {
    expect(parseEml(eml("From: a@b.com\nSubject: T")).attachments).toEqual([]);
  });

  it("does not list the same file twice", () => {
    const raw = [
      "From: a@b.com",
      "Subject: T",
      'Content-Type: multipart/mixed; boundary="BB"',
      "",
      "--BB",
      "Content-Type: text/plain",
      "",
      "body",
      "--BB",
      'Content-Type: image/png; name="logo.png"',
      'Content-Disposition: inline; filename="logo.png"',
      "",
      "AAAA",
      "--BB--",
    ].join("\n");

    expect(parseEml(raw).attachments).toHaveLength(1);
  });
});

describe("existing behaviour is preserved", () => {
  it("still extracts subject, from and a plain-text body", () => {
    const p = parseEml(eml("From: a@b.com\nTo: c@d.com\nSubject: Hi", "  Body  "));

    expect(p.subject).toBe("Hi");
    expect(p.from).toBe("a@b.com");
    expect(p.body).toBe("Body");
  });

  it("prefers text/plain inside multipart", () => {
    const raw = [
      "From: a@b.com",
      "Subject: T",
      'Content-Type: multipart/alternative; boundary="BB"',
      "",
      "--BB",
      "Content-Type: text/plain",
      "",
      "plain wins",
      "--BB",
      "Content-Type: text/html",
      "",
      "<p>html loses</p>",
      "--BB--",
    ].join("\n");

    expect(parseEml(raw).body).toBe("plain wins");
  });

  it("throws on a message with no header/body separator", () => {
    expect(() => parseEml("no separator here")).toThrow();
  });
});
