# Simulation results — six scenarios (Mesa, 5 replications each)

Base: 10 arrivals/h (Poisson), 3 dermatologists, 2 AI stations, 2 treatment desks, 8 h × 5 days,
doctor accuracy 0.80, AI accuracy 0.85 (experiment parameter). AI confidences are sampled from the trained
classifier's test-set confidence distribution. Patient case-mix and treatment response probabilities are
synthetic simulation parameters. Values are means (± SD where shown). Raw runs:
`backend/artifacts/reports/scenarios/latest_comparison.csv`.

| Scenario | Avg wait (min) | Derm. utilization | AI–human disagreement | Final dx accuracy | Reassessment | Left unseen |
|---|---|---|---|---|---|---|
| S1 Traditional | 6.8 ± 2.8 | 0.77 | – | 0.81 | 0.14 | 0.6 |
| S2 AI-assisted | 8.5 ± 1.8 | 0.75 | 0.25 | 0.85 | 0.13 | 1.2 |
| S3 High load (16/h), AI | 48.0 ± 5.1 | 0.99 | 0.26 | 0.85 | 0.14 | 110 |
| S3 High load, no AI | 56.0 ± 5.6 | 0.99 | – | 0.80 | 0.16 | 121 |
| S4 Two dermatologists, AI | 39.0 ± 4.0 | 0.97 | 0.24 | 0.85 | 0.14 | 50 |
| S4 Two dermatologists, no AI | 44.0 ± 3.6 | 0.98 | – | 0.78 | 0.17 | 55 |
| S5 AI accuracy 0.50 | 10.5 | 0.79 | 0.48 | 0.82 | 0.14 | 2.8 |
| S5 AI accuracy 0.80 | 8.8 | 0.76 | 0.30 | 0.83 | 0.13 | 0.6 |
| S5 AI accuracy 0.97 | 8.0 | 0.74 | 0.17 | 0.84 | 0.15 | 0.6 |
| S6 Knowledge-augmented | 14.3 ± 3.2 | 0.84 | 0.31 | 0.85 | 0.21 | 4.4 |

Observations (emergent, not hard-coded):
1. AI assistance improves final diagnostic accuracy in every comparison (+4–7 points).
2. Under congestion (S3, S4) the AI workflow reduces waiting time and patients leaving unseen.
3. At baseline load AI does **not** reduce waiting: the real classifier is rarely confident, so most cases
   trigger longer "further assessment" consults. Raising AI confidence/accuracy (S5) lowers waiting
   time and disagreement monotonically.
4. The knowledge-graph check (S6) raises reassessments (0.21 vs 0.13) and waiting time without improving
   accuracy over S2. With 15% atypical symptom presentations, symptom-based conflict detection overrides
   correct AI suggestions about as often as it catches wrong ones.

Re-run from the UI (Scenario Comparison page) or `POST /api/scenarios/compare {"replications": 5}`.
