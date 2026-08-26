import { describe, it, expect } from 'bun:test';
import { stripQuotedThread } from './strip-quotes';

// ---------------------------------------------------------------------------
// KAI-181: a reply's body is "what was typed this time" plus everything the
// thread has quoted before it. Feeding the whole thing to the classifier means
// re-reading (and re-paying for) the same block on every reply. These tests
// pin the boundary between the two.
// ---------------------------------------------------------------------------

describe('stripQuotedThread', () => {
  it('returns the whole body when it opens the thread', () => {
    const body = 'Buenas tardes, no me ha llegado el pedido, ¿me pueden confirmar?';
    expect(stripQuotedThread(body)).toBe(body);
  });

  it('cuts at a leading ">" reply marker', () => {
    const body = 'Seguimos sin respuesta.\n\n> Mensaje anterior\n> con varias líneas';
    expect(stripQuotedThread(body)).toBe('Seguimos sin respuesta.');
  });

  it('cuts at "El ... escribió:", even split across wrapped lines', () => {
    const body =
      'Gracias por la actualización.\n\nEl mié, 1 abr 2026 a las\n10:50, Doris Zulay <d@x.com> escribió:\n\nTexto citado';
    expect(stripQuotedThread(body)).toBe('Gracias por la actualización.');
  });

  it('cuts at "On ... wrote:", even split across wrapped lines', () => {
    // The exact shape found in the KAI-93 corpus (correo 011): the client
    // reflows the quote header with embedded line breaks mid-sentence
    const body =
      'El cambio se realizó ayer.\n\n   On\r\n   Wed, 1 Apr at 10:50 AM\r\n   ,  Doris Zulay <d@x.com>  wrote:\r\n   Texto citado';
    expect(stripQuotedThread(body)).toBe('El cambio se realizó ayer.');
  });

  it('cuts at an Outlook underscore separator line', () => {
    const body =
      'Por favor confirmar.\n________________________________\nDe: Alguien\nEnviado: hoy\n\nTexto citado';
    expect(stripQuotedThread(body)).toBe('Por favor confirmar.');
  });

  it('cuts at a "-----Original Message-----" separator', () => {
    const body = 'Ya se corrigió la novedad.\n-----Original Message-----\nDe: X\n\nTexto citado';
    expect(stripQuotedThread(body)).toBe('Ya se corrigió la novedad.');
  });

  it('cuts at a bare "De:"/"From:" header line when no separator precedes it', () => {
    const body = 'Adjunto la información solicitada.\nDe: Jose <jose@x.com>\nPara: equipo\n\nTexto citado';
    expect(stripQuotedThread(body)).toBe('Adjunto la información solicitada.');
  });

  it('picks the earliest marker when several are present', () => {
    const body = 'Nuevo texto.\n> cita 1\nEl 1 abr escribió:\ncita 2';
    expect(stripQuotedThread(body)).toBe('Nuevo texto.');
  });

  it('trims trailing whitespace left by the cut but not internal content', () => {
    const body = 'Texto nuevo con espacio final.   \n\n> cita';
    expect(stripQuotedThread(body)).toBe('Texto nuevo con espacio final.');
  });

  it('returns an empty string for an empty body', () => {
    expect(stripQuotedThread('')).toBe('');
  });

  it('does not cut on ">" appearing mid-sentence, only at line start', () => {
    const body = 'El precio subió de 10 > 20 este mes.';
    expect(stripQuotedThread(body)).toBe(body);
  });
});
