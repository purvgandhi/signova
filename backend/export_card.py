from __future__ import annotations

import json
from pathlib import Path
from backend.models import WordPackItem

DATA_FILE = Path(__file__).parent / "data" / "local_sentences.json"

def generate_emergency_card_html() -> str:
    phrases = []
    try:
        data = json.loads(DATA_FILE.read_text(encoding="utf-8"))
        phrases = data.get("emergency_phrases", [])
    except Exception:
        pass

    rows_html = ""
    for p in phrases:
        cat = p.get("category", "General")
        eng = p.get("english", "")
        hin = p.get("hindi", "")
        mar = p.get("marathi", "")
        rows_html += f"""
        <tr class="phrase-row">
            <td class="badge-col"><span class="cat-badge">{cat}</span></td>
            <td class="lang-eng"><strong>{eng}</strong></td>
            <td class="lang-dev">{hin}</td>
            <td class="lang-dev">{mar}</td>
        </tr>
        """

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>SignBridge — Emergency Assistive Communication Card</title>
<style>
    @page {{
        size: A4 portrait;
        margin: 15mm;
    }}
    * {{
        box-sizing: border-box;
        margin: 0;
        padding: 0;
    }}
    body {{
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        color: #0F172A;
        background: #ffffff;
        padding: 24px;
        line-height: 1.4;
    }}
    .card-header {{
        border-bottom: 3px solid #1E40AF;
        padding-bottom: 12px;
        margin-bottom: 16px;
        display: flex;
        justify-content: space-between;
        align-items: center;
    }}
    .title-area h1 {{
        font-size: 24px;
        color: #1E40AF;
        display: flex;
        align-items: center;
        gap: 8px;
    }}
    .title-area p {{
        font-size: 13px;
        color: #475569;
        margin-top: 4px;
    }}
    .badge-emergency {{
        background: #DC2626;
        color: #ffffff;
        font-weight: bold;
        padding: 6px 14px;
        border-radius: 999px;
        font-size: 13px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }}
    .info-grid {{
        display: grid;
        grid-template-columns: 1fr 1fr 1fr;
        gap: 12px;
        background: #F1F5F9;
        padding: 12px 16px;
        border-radius: 8px;
        margin-bottom: 20px;
        font-size: 12px;
    }}
    .info-item strong {{
        display: block;
        color: #1E293B;
        margin-bottom: 2px;
    }}
    table {{
        width: 100%;
        border-collapse: collapse;
        margin-bottom: 24px;
    }}
    th {{
        background: #1E293B;
        color: #ffffff;
        text-align: left;
        padding: 10px 12px;
        font-size: 13px;
        font-weight: 600;
    }}
    td {{
        padding: 10px 12px;
        border-bottom: 1px solid #CBD5E1;
        font-size: 13px;
    }}
    tr:nth-child(even) {{
        background: #F8FAFC;
    }}
    .cat-badge {{
        background: #E2E8F0;
        color: #334155;
        padding: 3px 8px;
        border-radius: 4px;
        font-size: 11px;
        font-weight: 600;
    }}
    .lang-eng {{
        color: #0F172A;
    }}
    .lang-dev {{
        font-size: 14px;
        color: #1E3A8A;
        font-weight: 500;
    }}
    .gesture-guide {{
        border: 1px solid #CBD5E1;
        border-radius: 8px;
        padding: 14px;
        margin-bottom: 20px;
    }}
    .gesture-guide h3 {{
        font-size: 14px;
        color: #1E40AF;
        margin-bottom: 8px;
    }}
    .tokens-pill-row {{
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
    }}
    .token-pill {{
        background: #EEF2FF;
        border: 1px solid #C7D2FE;
        color: #3730A3;
        font-size: 11px;
        font-weight: 600;
        padding: 4px 10px;
        border-radius: 12px;
    }}
    .footer-note {{
        text-align: center;
        font-size: 11px;
        color: #64748B;
        border-top: 1px solid #E2E8F0;
        padding-top: 12px;
    }}
    .print-btn {{
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: #2563EB;
        color: #ffffff;
        border: none;
        padding: 12px 24px;
        font-size: 14px;
        font-weight: bold;
        border-radius: 30px;
        cursor: pointer;
        box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3);
    }}
    @media print {{
        .print-btn {{ display: none; }}
        body {{ padding: 0; }}
    }}
</style>
</head>
<body>
    <div class="card-header">
        <div class="title-area">
            <h1><span>🤟</span> SignBridge Assistive Emergency Card</h1>
            <p>Non-Verbal / Sign Language Rapid Tri-Lingual Communication Sheet</p>
        </div>
        <div class="badge-emergency">Emergency Assist</div>
    </div>

    <div class="info-grid">
        <div class="info-item">
            <strong>USER / HOLDER:</strong>
            <span>Assistive Signer</span>
        </div>
        <div class="info-item">
            <strong>COMMUNICATION METHOD:</strong>
            <span>Sign Language &amp; SLM Bridge</span>
        </div>
        <div class="info-item">
            <strong>LOCAL SYSTEM:</strong>
            <span>SignBridge Studio (Local 127.0.0.1:8000)</span>
        </div>
    </div>

    <table>
        <thead>
            <tr>
                <th style="width: 18%;">Category</th>
                <th style="width: 32%;">English</th>
                <th style="width: 25%;">Hindi (हिंदी)</th>
                <th style="width: 25%;">Marathi (मराठी)</th>
            </tr>
        </thead>
        <tbody>
            {rows_html}
        </tbody>
    </table>

    <div class="gesture-guide">
        <h3>Supported Controlled Signs (20 Key Core Gestures)</h3>
        <div class="tokens-pill-row">
            <span class="token-pill">HELLO</span>
            <span class="token-pill">YES</span>
            <span class="token-pill">NO</span>
            <span class="token-pill">PLEASE</span>
            <span class="token-pill">THANK YOU</span>
            <span class="token-pill">WATER</span>
            <span class="token-pill">FOOD</span>
            <span class="token-pill">HELP</span>
            <span class="token-pill">STOP</span>
            <span class="token-pill">GOOD</span>
            <span class="token-pill">BAD</span>
            <span class="token-pill">MORE</span>
            <span class="token-pill">WHERE</span>
            <span class="token-pill">WHAT</span>
            <span class="token-pill">NAME</span>
            <span class="token-pill">HOME</span>
            <span class="token-pill">SCHOOL</span>
            <span class="token-pill">DOCTOR</span>
            <span class="token-pill">PAIN</span>
            <span class="token-pill">HAPPY</span>
        </div>
    </div>

    <div class="footer-note">
        SignBridge Intelligence Studio &bull; Tri-lingual SLM Assistive Bridge &bull; Local Offline-Capable
    </div>

    <button class="print-btn" onclick="window.print()">🖨️ Print / Save as PDF</button>
</body>
</html>"""
    return html
