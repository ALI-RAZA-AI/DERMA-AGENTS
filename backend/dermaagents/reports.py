"""Report export (PDF / CSV / JSON) built from live backend data."""
from __future__ import annotations

import io
import json
import time

import pandas as pd

from .config import MODEL_REPORTS_DIR, REPORTS_DIR


def _scenario_chart(summary: pd.DataFrame, metric: str, title: str) -> bytes | None:
    if summary is None or summary.empty or f"{metric}_mean" not in summary:
        return None
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    labels = [f"{r.scenario.split('_')[0]} {r.variant if r.variant != 'main' else ''}".strip() for r in summary.itertuples()]
    fig, ax = plt.subplots(figsize=(7.2, 3.2), dpi=150)
    ax.barh(labels[::-1], summary[f"{metric}_mean"].values[::-1], xerr=summary[f"{metric}_sd"].values[::-1],
            color="#2a78d6", height=0.6, error_kw={"elinewidth": 0.8, "ecolor": "#52514e"})
    ax.set_title(title, loc="left", fontsize=9)
    ax.tick_params(labelsize=6)
    for s in ("top", "right"):
        ax.spines[s].set_visible(False)
    fig.tight_layout()
    buf = io.BytesIO()
    fig.savefig(buf, format="png")
    plt.close(fig)
    return buf.getvalue()


def build_pdf(analytics: dict, scenario_summary: pd.DataFrame | None) -> bytes:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.lib.units import cm
    from reportlab.platypus import Image, PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

    st = getSampleStyleSheet()
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=1.8 * cm, rightMargin=1.8 * cm, topMargin=1.6 * cm,
                            bottomMargin=1.6 * cm, title="DermaAgents report")
    el = [Paragraph("DermaAgents - Agent-Based Dermatology Diagnosis &amp; Care Simulation", st["Title"]),
          Paragraph(f"Generated {time.strftime('%Y-%m-%d %H:%M')} | Designed and Developed by ALI RAZA | "
                    "University of Central Punjab, Section AG2", st["Normal"]),
          Paragraph("<b>Academic simulation only - not a medical device and not medical advice.</b>", st["Normal"]),
          Spacer(1, 10)]

    def table(rows, widths=None):
        t = Table(rows, colWidths=widths, repeatRows=1)
        t.setStyle(TableStyle([("FONTSIZE", (0, 0), (-1, -1), 7.5), ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0f1b3d")),
                               ("TEXTCOLOR", (0, 0), (-1, 0), colors.white), ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#c8cdd6")),
                               ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f3f6fb")])]))
        return t

    ds = analytics.get("dataset", {})
    if ds:
        el += [Paragraph("1. Dataset audit", st["Heading2"]),
               Paragraph(f"Readable images: {ds.get('total_images_readable')}; labelled: {ds.get('labelled_images')}; "
                         f"unlabelled (HAM10000 without metadata): {ds.get('unlabelled_images', {}).get('count')}; "
                         f"corrupted: {ds.get('corrupted_or_non_image')}.", st["Normal"])]
        rows = [["Proposal class", "Status"]] + [[k, v] for k, v in ds.get("proposal_mapping", {}).items()]
        el += [table(rows, [7 * cm, 7 * cm]), Spacer(1, 6)]
        img = REPORTS_DIR / "dataset" / "class_distribution.png"
        if img.exists():
            el.append(Image(str(img), width=15 * cm, height=9 * cm))
    mdl = analytics.get("model", {})
    if mdl:
        tm = mdl.get("test_metrics", {})
        el += [PageBreak(), Paragraph("2. Classifier evaluation", st["Heading2"]),
               Paragraph(f"Selected backbone: <b>{mdl.get('selected_backbone')}</b> ({mdl.get('selection_rule')}). "
                         f"Test accuracy {tm.get('accuracy', 0):.3f} (95% CI {tm.get('accuracy_95ci_bootstrap')}), "
                         f"macro-F1 {tm.get('macro_f1', 0):.3f}.", st["Normal"])]
        rows = [["Backbone", "Val macro-F1", "Test acc", "Test macro-F1"]] + [
            [b["backbone"], f"{b['val_macro_f1']:.3f}", f"{b['test_accuracy']:.3f}", f"{b['test_macro_f1']:.3f}"]
            for b in mdl.get("backbone_comparison", [])]
        el += [table(rows), Spacer(1, 6)]
        rows = [["Class", "Precision", "Recall", "F1", "Support"]] + [
            [c, f"{v['precision']:.2f}", f"{v['recall']:.2f}", f"{v['f1']:.2f}", v["support"]]
            for c, v in tm.get("per_class", {}).items()]
        el += [table(rows), Spacer(1, 6)]
        cf = mdl.get("conformal", {})
        el.append(Paragraph(f"Conformal prediction (alpha={cf.get('alpha')}): test coverage "
                            f"{cf.get('test_empirical_coverage', 0):.3f}, mean set size {cf.get('test_mean_set_size', 0):.2f}. "
                            f"OOD false-flag rate on test {mdl.get('ood', {}).get('test_in_distribution_false_flag_rate', 0):.3f}.",
                            st["Normal"]))
        img = MODEL_REPORTS_DIR / "confusion_matrix.png"
        if img.exists():
            el.append(Image(str(img), width=14 * cm, height=12 * cm))
    if scenario_summary is not None and not scenario_summary.empty:
        el += [PageBreak(), Paragraph("3. Six-scenario simulation comparison", st["Heading2"])]
        cols = [("avg_waiting_time_min", "Wait (min)"), ("patients_served", "Served"),
                ("dermatologist_utilization", "Util."), ("ai_human_disagreement_rate", "Disagree"),
                ("diagnostic_accuracy_final", "Dx acc."), ("reassessment_rate", "Reassess"),
                ("kg_agreement_rate", "KG agree")]
        rows = [["Scenario", "Variant"] + [c[1] for c in cols]]
        for r in scenario_summary.to_dict(orient="records"):
            rows.append([r["scenario"], str(r["variant"])[:22]] + [
                "-" if r.get(f"{c}_mean") is None or pd.isna(r.get(f"{c}_mean")) else f"{r[f'{c}_mean']:.2f}" for c, _ in cols])
        el.append(table(rows))
        for metric, title in [("avg_waiting_time_min", "Average waiting time (min), mean +/- SD over replications"),
                              ("ai_human_disagreement_rate", "AI-human disagreement rate")]:
            png = _scenario_chart(scenario_summary, metric, title)
            if png:
                el.append(Image(io.BytesIO(png), width=16 * cm, height=7 * cm))
    cs = analytics.get("cases", {})
    if cs:
        el += [Paragraph("4. Live case workflow statistics", st["Heading2"]),
               Paragraph(json.dumps(cs)[:1500], st["Code"])]
    doc.build(el)
    return buf.getvalue()
