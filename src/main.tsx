import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import './style.css';

interface Attachment {
  name: string;
  type: string;
  data: string; // base64
}

interface Email {
  id: string;
  from: string;
  to: string;
  subject: string;
  body: string;
  date: string;
  includeReceived: boolean;
  attachments: Attachment[];
}

const DOMAIN = 'test.local';

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function formatDateTimeLocal(date: Date): string {
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function formatDateRfc2822(date: Date): string {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const dayName = days[date.getDay()];
  const day = pad(date.getDate());
  const month = months[date.getMonth()];
  const year = date.getFullYear();
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());
  const offset = -date.getTimezoneOffset();
  const offsetHours = pad(Math.floor(Math.abs(offset) / 60));
  const offsetMinutes = pad(Math.abs(offset) % 60);
  const offsetSign = offset >= 0 ? '+' : '-';
  return `${dayName}, ${day} ${month} ${year} ${hours}:${minutes}:${seconds} ${offsetSign}${offsetHours}${offsetMinutes}`;
}

function toBase64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  const binString = Array.from(bytes, (b) => String.fromCharCode(b)).join('');
  return btoa(binString);
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const binString = Array.from(bytes, (b) => String.fromCharCode(b)).join('');
  return btoa(binString);
}

function generateMessageId(): string {
  try {
    return `<${crypto.randomUUID()}@${DOMAIN}>`;
  } catch {
    return `<${Date.now()}-${Math.random().toString(36).slice(2)}@${DOMAIN}>`;
  }
}

function wrapBase64(base64: string, width = 76): string {
  const parts: string[] = [];
  for (let i = 0; i < base64.length; i += width) {
    parts.push(base64.slice(i, i + width));
  }
  return parts.join('\r\n');
}

function generateEml(email: Email): string {
  const date = new Date(email.date);
  const boundary = `----=${crypto.randomUUID?.().replace(/-/g, '') ?? Date.now().toString(36)}`;
  const hasAttachments = email.attachments.length > 0;

  const headers: string[] = [
    `From: ${email.from}`,
    `To: ${email.to}`,
    `Subject: ${email.subject}`,
    `Date: ${formatDateRfc2822(date)}`,
    `Message-ID: ${generateMessageId()}`,
  ];

  if (email.includeReceived) {
    const recibido = `from ${DOMAIN} (localhost [127.0.0.1]) by ${DOMAIN} with ESMTP id ${Math.floor(10000 + Math.random() * 90000)}; ${formatDateRfc2822(date)}`;
    headers.push(`Received: ${recibido}`);
  }

  headers.push('MIME-Version: 1.0');

  if (hasAttachments) {
    headers.push(`Content-Type: multipart/mixed;\r\n\tboundary="${boundary}"`);
  } else {
    headers.push('Content-Type: text/plain; charset="utf-8"');
    headers.push('Content-Transfer-Encoding: base64');
  }

  let body = '';
  if (hasAttachments) {
    body += `This is a multi-part message in MIME format.\r\n\r\n`;
    body += `--${boundary}\r\n`;
    body += `Content-Type: text/plain; charset="utf-8"\r\n`;
    body += `Content-Transfer-Encoding: base64\r\n\r\n`;
    body += `${wrapBase64(toBase64(email.body))}\r\n\r\n`;

    for (const att of email.attachments) {
      body += `--${boundary}\r\n`;
      body += `Content-Type: ${att.type || 'application/octet-stream'}; name="${att.name}"\r\n`;
      body += `Content-Disposition: attachment; filename="${att.name}"\r\n`;
      body += `Content-Transfer-Encoding: base64\r\n\r\n`;
      body += `${wrapBase64(att.data)}\r\n\r\n`;
    }

    body += `--${boundary}--\r\n`;
  } else {
    body += wrapBase64(toBase64(email.body));
  }

  return `${headers.join('\r\n')}\r\n\r\n${body}`;
}

function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '_')
    .slice(0, 30)
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

function filenameFor(index: number, email: Email): string {
  const date = new Date(email.date);
  const slug = slugify(email.subject) || 'correo';
  return `${pad(index)}_${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${slug}.eml`;
}

function useDateRange(): { min: Date; max: Date } {
  return useMemo(() => {
    const now = new Date();
    const max = now;
    const min = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate(), now.getHours(), now.getMinutes());
    return { min, max };
  }, []);
}

function generatePythonScript(emails: Email[]): string {
  const serializable = emails.map((e) => ({
    from: e.from,
    to: e.to,
    subject: e.subject,
    body: e.body,
    date: new Date(e.date).toISOString(),
    include_received: e.includeReceived,
    attachments: e.attachments.map((a) => ({ name: a.name, type: a.type, data: a.data })),
  }));

  const pythonDict = JSON.stringify(serializable, null, 4)
    .replace(/true/g, 'True')
    .replace(/false/g, 'False')
    .replace(/null/g, 'None');

  return `#!/usr/bin/env python3
"""
Script de inyeccion IMAP generado por Cambio Fechas Email.
Ejecuta en tu PC para subir los correos a la carpeta que elijas de tu servidor IMAP.
"""
import imaplib
import getpass
import random
import base64
from datetime import datetime
from email.message import EmailMessage
from email.utils import format_datetime, make_msgid

EMAILS = ${pythonDict}

DOMAIN = "${DOMAIN}"


def construir_mensaje(data):
    fecha = datetime.fromisoformat(data["date"])
    msg = EmailMessage()
    msg["From"] = data["from"]
    msg["To"] = data["to"]
    msg["Subject"] = data["subject"]
    msg["Date"] = format_datetime(fecha)
    msg["Message-ID"] = make_msgid(domain=DOMAIN)
    if data.get("include_received"):
        recibido = (
            f"from {DOMAIN} (localhost [127.0.0.1]) "
            f"by {DOMAIN} with ESMTP id {random.randint(10000, 99999)}; "
            f"{format_datetime(fecha)}"
        )
        msg["Received"] = recibido

    msg.set_content(data["body"])

    for att in data.get("attachments", []):
        contenido = base64.b64decode(att["data"])
        msg.add_attachment(
            contenido,
            maintype="application",
            subtype="octet-stream",
            filename=att["name"],
        )

    return msg, fecha


def main():
    host = input("Servidor IMAP (host): ").strip()
    port = input("Puerto [993]: ").strip() or "993"
    usuario = input("Usuario: ").strip()
    clave = getpass.getpass("Contraseña: ")
    carpeta = input("Carpeta destino [INBOX]: ").strip() or "INBOX"

    try:
        imap = imaplib.IMAP4_SSL(host, int(port))
        imap.login(usuario, clave)
    except Exception as e:
        print(f"No se pudo conectar/login: {e}")
        return

    ok = 0
    for data in EMAILS:
        msg, fecha = construir_mensaje(data)
        try:
            internaldate = imaplib.Time2Internaldate(fecha.timestamp())
            imap.append(carpeta, r"(\\Seen)", internaldate, msg.as_bytes())
            ok += 1
            print(f"OK: {data['subject']}")
        except Exception as e:
            print(f"ERROR en '{data['subject']}': {e}")

    imap.logout()
    print(f"\\n{ok}/{len(EMAILS)} correos inyectados en '{carpeta}'.")


if __name__ == "__main__":
    main()
`;
}

function App() {
  const { min, max } = useDateRange();
  const defaultDate = formatDateTimeLocal(max);

  const [emails, setEmails] = useState<Email[]>([]);
  const [form, setForm] = useState({
    from: '',
    to: '',
    subject: '',
    body: '',
    date: defaultDate,
    includeReceived: true,
    attachments: [] as Attachment[],
  });
  const [dateError, setDateError] = useState('');

  const validateDate = (value: string): boolean => {
    const d = new Date(value);
    if (d < min || d > max) {
      setDateError(`La fecha debe estar entre ${min.toLocaleDateString('es-ES')} y ${max.toLocaleDateString('es-ES')}.`);
      return false;
    }
    setDateError('');
    return true;
  };

  const updateForm = (field: keyof typeof form, value: string | boolean | Attachment[]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (field === 'date' && typeof value === 'string') {
      validateDate(value);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const newAttachments: Attachment[] = [];
    for (const file of Array.from(files)) {
      const buffer = await file.arrayBuffer();
      newAttachments.push({
        name: file.name,
        type: file.type || 'application/octet-stream',
        data: arrayBufferToBase64(buffer),
      });
    }

    setForm((prev) => ({ ...prev, attachments: [...prev.attachments, ...newAttachments] }));
    e.target.value = '';
  };

  const removeAttachment = (index: number) => {
    setForm((prev) => ({
      ...prev,
      attachments: prev.attachments.filter((_, i) => i !== index),
    }));
  };

  const addEmail = () => {
    if (!form.from || !form.to || !form.subject) return;
    if (!validateDate(form.date)) return;

    const email: Email = {
      id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
      from: form.from,
      to: form.to,
      subject: form.subject,
      body: form.body,
      date: form.date,
      includeReceived: form.includeReceived,
      attachments: form.attachments,
    };

    setEmails((prev) => [...prev, email]);
    setForm((prev) => ({ ...prev, subject: '', body: '', attachments: [] }));
  };

  const removeEmail = (id: string) => {
    setEmails((prev) => prev.filter((e) => e.id !== id));
  };

  const generateZip = async () => {
    if (emails.length === 0) return;
    const zip = new JSZip();
    emails.forEach((email, idx) => {
      zip.file(filenameFor(idx + 1, email), generateEml(email));
    });
    const blob = await zip.generateAsync({ type: 'blob' });
    saveAs(blob, `correos-test-${Date.now()}.zip`);
  };

  const downloadScript = () => {
    if (emails.length === 0) return;
    const blob = new Blob([generatePythonScript(emails)], { type: 'text/x-python' });
    saveAs(blob, `inyectar_correos_${Date.now()}.py`);
  };

  const addSamples = () => {
    const samples: Email[] = [
      {
        id: crypto.randomUUID?.() ?? `${Date.now()}-1`,
        from: 'cliente@example.com',
        to: 'soporte@empresa.test',
        subject: 'Consulta sobre factura',
        body: 'Hola, tengo una duda con la factura del mes pasado. Gracias.',
        date: defaultDate,
        includeReceived: true,
        attachments: [],
      },
      {
        id: crypto.randomUUID?.() ?? `${Date.now()}-2`,
        from: 'proveedor@example.com',
        to: 'compras@empresa.test',
        subject: 'Presupuesto actualizado',
        body: 'Adjunto el presupuesto con las modificaciones solicitadas.',
        date: defaultDate,
        includeReceived: true,
        attachments: [],
      },
    ];
    setEmails((prev) => [...prev, ...samples]);
  };

  return (
    <main className="app-shell">
      <section className="panel">
        <p className="eyebrow">Cambio Fechas Email</p>
        <h1>Generador de correos de prueba</h1>
        <p className="copy">
          Crea archivos .eml con fechas de hasta 3 meses atrás (incluyendo hoy), adjuntos opcionales y genera un script Python para inyectarlos por IMAP.
        </p>

        <div className="form">
          <div className="field-row">
            <div className="field">
              <label htmlFor="from">From</label>
              <input
                id="from"
                type="email"
                value={form.from}
                onChange={(e) => updateForm('from', e.target.value)}
                placeholder="remitente@example.com"
              />
            </div>
            <div className="field">
              <label htmlFor="to">To</label>
              <input
                id="to"
                type="email"
                value={form.to}
                onChange={(e) => updateForm('to', e.target.value)}
                placeholder="destinatario@example.com"
              />
            </div>
          </div>

          <div className="field">
            <label htmlFor="subject">Subject</label>
            <input
              id="subject"
              type="text"
              value={form.subject}
              onChange={(e) => updateForm('subject', e.target.value)}
              placeholder="Asunto del correo"
            />
          </div>

          <div className="field">
            <label htmlFor="body">Cuerpo</label>
            <textarea
              id="body"
              rows={4}
              value={form.body}
              onChange={(e) => updateForm('body', e.target.value)}
              placeholder="Escribe el cuerpo del mensaje..."
            />
          </div>

          <div className="field">
            <label htmlFor="attachments">Adjuntos</label>
            <input
              id="attachments"
              type="file"
              multiple
              onChange={handleFileChange}
            />
            {form.attachments.length > 0 && (
              <ul className="attachment-list">
                {form.attachments.map((att, idx) => (
                  <li key={idx} className="attachment-item">
                    <span>{att.name}</span>
                    <button className="button danger small" onClick={() => removeAttachment(idx)}>
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="field-row">
            <div className="field">
              <label htmlFor="date">Fecha</label>
              <input
                id="date"
                type="datetime-local"
                min={formatDateTimeLocal(min)}
                max={formatDateTimeLocal(max)}
                value={form.date}
                onChange={(e) => updateForm('date', e.target.value)}
              />
              {dateError && <p className="error">{dateError}</p>}
            </div>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={form.includeReceived}
                onChange={(e) => updateForm('includeReceived', e.target.checked)}
              />
              <span>Incluir cabecera Received</span>
            </label>
          </div>

          <div className="form-actions">
            <button className="button primary" onClick={addEmail}>
              Añadir correo
            </button>
            <button className="button secondary" onClick={addSamples}>
              Cargar ejemplos
            </button>
          </div>
        </div>

        {emails.length > 0 && (
          <>
            <h2>Correos definidos ({emails.length})</h2>
            <div className="email-list">
              {emails.map((email, idx) => (
                <div key={email.id} className="email-row">
                  <div className="email-info">
                    <span className="email-subject">{email.subject}</span>
                    <span className="email-meta">
                      {email.from} → {email.to} · {new Date(email.date).toLocaleString('es-ES')}
                      {email.attachments.length > 0 && ` · ${email.attachments.length} adjunto${email.attachments.length !== 1 ? 's' : ''}`}
                    </span>
                  </div>
                  <button className="button danger" onClick={() => removeEmail(email.id)}>
                    ×
                  </button>
                </div>
              ))}
            </div>

            <div className="summary">
              <button className="button danger" onClick={() => setEmails([])}>
                Limpiar todo
              </button>
              <div className="actions">
                <button className="button secondary" onClick={downloadScript}>
                  Descargar script IMAP
                </button>
                <button className="button primary" onClick={generateZip}>
                  Descargar .eml (ZIP)
                </button>
              </div>
            </div>
          </>
        )}
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
