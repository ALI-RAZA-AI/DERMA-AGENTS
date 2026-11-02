"""Structured dermatology knowledge for the six proposal diseases.

Each symptom link, differential and care-pathway stage cites a key from
sources.SOURCES. Text is paraphrased for academic use and is not clinically
validated. Care pathways are *simulated, category-level* stages (no drug names,
doses or instructions) and the response probabilities attached to them are
synthetic SIMULATION PARAMETERS, not clinical evidence.
"""

SYMPTOMS = {
    # id: (label, description)
    "oily_skin": ("Oily / greasy skin", "Excess sebum on the face or trunk."),
    "comedones": ("Blackheads or whiteheads", "Open or closed comedones."),
    "inflamed_spots": ("Red inflamed spots / pustules", "Papules or pus-filled spots."),
    "nodules_cysts": ("Painful deep lumps (nodules/cysts)", "Deep, painful lesions under the skin."),
    "face_chest_back": ("Lesions on face, chest or back", "Typical acne distribution."),
    "scarring": ("Scarring", "Marks or pits left after lesions heal."),
    "itch": ("Itching", "Pruritus of the affected skin."),
    "dry_skin": ("Dry skin", "Rough, dry skin."),
    "red_patches": ("Red / inflamed patches", "Areas of inflamed skin."),
    "cracked_skin": ("Cracked or sore skin", "Fissured, sore skin."),
    "flare_pattern": ("Flare-ups and remissions", "Symptoms come and go over time."),
    "weeping_crusting": ("Weeping or crusted skin", "Oozing or crusting (possible infection)."),
    "atopic_history": ("Personal/family history of asthma or hay fever", "Atopic background."),
    "skin_creases": ("Lesions in skin creases", "Elbow folds, behind knees, neck."),
    "silvery_scales": ("Silvery-white scales", "Scaly plaques with silvery-white scale."),
    "plaques_extensor": ("Plaques on elbows, knees, scalp or lower back", "Typical plaque psoriasis sites."),
    "joint_pain": ("Joint pain or stiffness", "Possible psoriatic arthritis."),
    "nail_changes": ("Nail changes", "Pitting or thickening of nails."),
    "new_or_changing_mole": ("New or changing mole", "A new mole or a change in an existing one."),
    "asymmetry": ("Asymmetrical lesion", "Two halves differ in shape."),
    "irregular_border": ("Irregular border", "Ragged, notched or blurred edge."),
    "multiple_colours": ("Several colours in one lesion", "Uneven colour, mixed shades."),
    "large_diameter": ("Lesion wider than about 6 mm", "Larger than typical benign moles."),
    "bleeding_lesion": ("Bleeding or itchy lesion", "Lesion that bleeds, crusts or itches."),
    "pearly_bump": ("Shiny / pearly bump", "Small pink, red or pearly bump."),
    "non_healing_sore": ("Sore that does not heal", "Ulcer or scab persisting for weeks."),
    "sun_exposed_site": ("On a sun-exposed site (face, ears, neck)", "Chronically sun-exposed skin."),
    "slow_growth": ("Slowly growing lesion", "Gradual enlargement over months."),
    "stuck_on": ("'Stuck-on' waxy lesion", "Looks pasted onto the skin surface."),
    "brown_black_lesion": ("Brown or black lesion", "Pigmented lesion."),
    "warty_surface": ("Rough, warty surface", "Scaly or warty texture."),
    "older_age": ("Older adult (typically 50+)", "Age-related onset."),
    "multiple_lesions": ("Multiple similar lesions", "Many lesions of the same type."),
}

# disease -> list of (symptom_id, weight 0..1, source_key). Weight = how characteristic
# the symptom is for that disease in the cited source (author-assigned for simulation).
DISEASES = {
    "Acne": {
        "summary": "Common condition causing spots, oily skin and sometimes painful lumps, mainly on face, chest and back.",
        "symptoms": [("oily_skin", 0.8, "nhs_acne"), ("comedones", 0.9, "nhs_acne"), ("inflamed_spots", 0.9, "nhs_acne"),
                     ("nodules_cysts", 0.6, "nhs_acne"), ("face_chest_back", 0.9, "nhs_acne"), ("scarring", 0.4, "selfcare_acne")],
        "differentials": ["Rosacea"],
        "classifier_label": "Acne",
    },
    "Eczema": {
        "summary": "Atopic eczema makes skin itchy, dry, red and cracked; usually long-term with flare-ups.",
        "symptoms": [("itch", 0.95, "wales_eczema"), ("dry_skin", 0.9, "wales_eczema"), ("red_patches", 0.8, "wales_eczema"),
                     ("cracked_skin", 0.7, "wales_eczema"), ("flare_pattern", 0.8, "nhs_eczema_children"),
                     ("atopic_history", 0.6, "nhs_eczema_children"), ("skin_creases", 0.6, "nhs_eczema_children"),
                     ("weeping_crusting", 0.3, "wales_eczema")],
        "differentials": ["Psoriasis"],
        "classifier_label": "Eczema",
    },
    "Psoriasis": {
        "summary": "Long-term condition with dry, itchy, flaky patches forming silvery-white scales; flares and remissions.",
        "symptoms": [("silvery_scales", 0.95, "nhs_psoriasis_sym"), ("plaques_extensor", 0.85, "nhs_psoriasis_types"),
                     ("itch", 0.6, "nhs_psoriasis_sym"), ("dry_skin", 0.6, "nhs_psoriasis_sym"),
                     ("red_patches", 0.6, "nhs_psoriasis_sym"), ("flare_pattern", 0.7, "nhs_psoriasis"),
                     ("joint_pain", 0.3, "nhs_psoriasis_sym"), ("nail_changes", 0.3, "nhs_psoriasis_sym")],
        "differentials": ["Eczema"],
        "classifier_label": None,  # not in the uploaded dataset -> classifier disabled
    },
    "Melanoma": {
        "summary": "Skin cancer of pigment cells; often first noticed as a new mole or a change in an existing mole (ABCDE).",
        "symptoms": [("new_or_changing_mole", 0.95, "cruk_melanoma"), ("asymmetry", 0.7, "hse_melanoma"),
                     ("irregular_border", 0.7, "pulse_abcde"), ("multiple_colours", 0.7, "pulse_abcde"),
                     ("large_diameter", 0.5, "hse_melanoma"), ("bleeding_lesion", 0.4, "cruk_melanoma"),
                     ("brown_black_lesion", 0.6, "spire_melanoma")],
        "differentials": ["Seborrheic Keratosis", "Basal Cell Carcinoma"],
        "classifier_label": None,  # only an unspecified 'Skin Cancer' label exists
        "parent": "Skin Cancer (unspecified)",
    },
    "Basal Cell Carcinoma": {
        "summary": "Most common, slow-growing skin cancer; usually a pearly bump or non-healing sore on sun-exposed skin.",
        "symptoms": [("pearly_bump", 0.85, "bidmc_bcc"), ("non_healing_sore", 0.8, "bidmc_bcc"),
                     ("sun_exposed_site", 0.8, "bidmc_bcc"), ("slow_growth", 0.7, "uhl_bcc"),
                     ("bleeding_lesion", 0.3, "bad_bcc")],
        "differentials": ["Seborrheic Keratosis", "Melanoma"],
        "classifier_label": None,
        "parent": "Skin Cancer (unspecified)",
    },
    "Seborrheic Keratosis": {
        "summary": "Very common harmless 'stuck-on' warty growth of adult skin; dark ones can resemble melanoma.",
        "symptoms": [("stuck_on", 0.9, "dermnet_sk2"), ("brown_black_lesion", 0.7, "bad_sk"),
                     ("warty_surface", 0.8, "dermnet_sk2"), ("older_age", 0.8, "dermnet_sk"),
                     ("multiple_lesions", 0.6, "dermnet_sk2"), ("itch", 0.2, "dermnet_sk")],
        "differentials": ["Melanoma", "Basal Cell Carcinoma"],
        "classifier_label": "Seborrheic Keratoses",
    },
    "Skin Cancer (unspecified)": {
        "summary": "Dataset umbrella label for malignant skin lesions without sub-type (melanoma, BCC, SCC, ...).",
        "symptoms": [("new_or_changing_mole", 0.6, "cruk_melanoma"), ("non_healing_sore", 0.6, "nwcr_skin"),
                     ("bleeding_lesion", 0.4, "cruk_melanoma"), ("slow_growth", 0.4, "nwcr_skin"),
                     ("brown_black_lesion", 0.4, "spire_melanoma"), ("pearly_bump", 0.4, "bidmc_bcc")],
        "differentials": ["Seborrheic Keratosis"],
        "classifier_label": "Skin Cancer",
    },
}

SEVERITY = {
    "Acne": {"mild": "A few spots, blackheads/whiteheads", "moderate": "Widespread inflamed spots",
             "severe": "Painful nodules or cysts; scarring risk", "source": "nhs_acne"},
    "Eczema": {"mild": "Small areas of dry, itchy skin", "moderate": "Red, itchy, widespread patches",
               "severe": "Extensive, cracked or weeping skin; possible infection", "source": "nhs_eczema"},
    "Psoriasis": {"mild": "Few small plaques", "moderate": "Larger areas affected",
                  "severe": "Widespread / pustular / erythrodermic forms needing urgent care", "source": "nhs_psoriasis_types"},
    "Melanoma": {"mild": "-", "moderate": "-", "severe": "Any suspicion warrants urgent specialist assessment",
                 "source": "cruk_melanoma"},
    "Basal Cell Carcinoma": {"mild": "Small, slow-growing lesion", "moderate": "Larger lesion",
                             "severe": "Large or long-untreated lesion (more complex treatment)", "source": "bad_bcc"},
    "Seborrheic Keratosis": {"mild": "Asymptomatic", "moderate": "Irritated / itchy lesion",
                             "severe": "Atypical appearance needing exclusion of cancer", "source": "dermnet_sk2"},
    "Skin Cancer (unspecified)": {"mild": "-", "moderate": "-", "severe": "Specialist assessment and biopsy",
                                  "source": "nwcr_skin"},
}

# Reassessment / escalation triggers (graph: Disease -requiresReassessment-> trigger)
ESCALATION = {
    "Acne": [("Nodules/cysts or scarring despite treatment -> specialist referral", "nice_ng198")],
    "Eczema": [("Weeping, crusting or rapidly worsening painful eczema (possible infection) -> urgent review", "wales_eczema")],
    "Psoriasis": [("Widespread pustules or skin-wide redness -> emergency care", "nhs_psoriasis_types"),
                  ("Recurring joint pain/swelling -> review for psoriatic arthritis", "nhs_psoriasis_types")],
    "Melanoma": [("New or changing mole with ABCDE features -> urgent specialist assessment", "cruk_melanoma")],
    "Basal Cell Carcinoma": [("Lesion not healing after ~4 weeks -> clinical assessment / biopsy", "nwcr_skin")],
    "Seborrheic Keratosis": [("Doubtful or very dark lesion -> biopsy to exclude melanoma", "dermnet_sk2")],
    "Skin Cancer (unspecified)": [("Any suspected malignancy -> dermatology referral and biopsy", "swbh_bcc")],
}

# SIMULATED care pathways (category level). p_response = synthetic per-stage
# probability that the simulated patient improves enough to exit the pathway.
PATHWAYS = {
    "Acne": [
        {"stage": "Skin-care advice and self-care", "category": "advice", "weeks": 6, "p_response": 0.30, "source": "nice_ng198"},
        {"stage": "Clinician-led topical treatment (topical class)", "category": "topical", "weeks": 12, "p_response": 0.50, "source": "nice_ng198"},
        {"stage": "Combined topical + oral therapy class", "category": "systemic", "weeks": 12, "p_response": 0.55, "source": "nice_ng198"},
        {"stage": "Specialist dermatology referral", "category": "referral", "weeks": 16, "p_response": 0.70, "source": "nice_ng198"},
    ],
    "Eczema": [
        {"stage": "Daily emollients and trigger avoidance", "category": "advice", "weeks": 4, "p_response": 0.35, "source": "nhs_eczema_tx"},
        {"stage": "Stepped topical anti-inflammatory treatment (topical class)", "category": "topical", "weeks": 4, "p_response": 0.55, "source": "nhs_eczema_tx"},
        {"stage": "Specialist referral (e.g. phototherapy / systemic class)", "category": "referral", "weeks": 12, "p_response": 0.65, "source": "hwt_eczema"},
    ],
    "Psoriasis": [
        {"stage": "Topical treatment (topical class)", "category": "topical", "weeks": 8, "p_response": 0.45, "source": "nhs_psoriasis"},
        {"stage": "Phototherapy", "category": "phototherapy", "weeks": 10, "p_response": 0.55, "source": "nhs_psoriasis"},
        {"stage": "Systemic / biological therapy class (specialist)", "category": "systemic", "weeks": 16, "p_response": 0.65, "source": "nhs_psoriasis"},
    ],
    "Melanoma": [
        {"stage": "Urgent specialist assessment and biopsy", "category": "referral", "weeks": 2, "p_response": 0.0, "source": "cruk_melanoma"},
        {"stage": "Surgical excision", "category": "surgery", "weeks": 4, "p_response": 0.80, "source": "spire_melanoma"},
        {"stage": "Further oncology treatment if spread (class level)", "category": "oncology", "weeks": 24, "p_response": 0.50, "source": "spire_melanoma"},
    ],
    "Basal Cell Carcinoma": [
        {"stage": "Dermatology assessment and biopsy", "category": "referral", "weeks": 4, "p_response": 0.0, "source": "bad_bcc"},
        {"stage": "Surgical removal", "category": "surgery", "weeks": 4, "p_response": 0.90, "source": "swbh_bcc"},
        {"stage": "Non-surgical options (e.g. photodynamic therapy, radiotherapy)", "category": "non_surgical", "weeks": 8, "p_response": 0.75, "source": "swbh_bcc"},
    ],
    "Seborrheic Keratosis": [
        {"stage": "Reassurance and monitoring (benign)", "category": "advice", "weeks": 12, "p_response": 0.70, "source": "dermnet_sk"},
        {"stage": "Optional removal if irritated or unsightly", "category": "procedure", "weeks": 4, "p_response": 0.90, "source": "dermnet_sk"},
    ],
    "Skin Cancer (unspecified)": [
        {"stage": "Dermatology referral and biopsy to establish sub-type", "category": "referral", "weeks": 2, "p_response": 0.0, "source": "swbh_bcc"},
        {"stage": "Surgical treatment per confirmed sub-type", "category": "surgery", "weeks": 4, "p_response": 0.80, "source": "swbh_bcc"},
    ],
}

FOLLOW_UP_WEEKS = {"Acne": 12, "Eczema": 4, "Psoriasis": 8, "Melanoma": 12, "Basal Cell Carcinoma": 12,
                   "Seborrheic Keratosis": 26, "Skin Cancer (unspecified)": 12}

# Knowledge-base passages (paraphrased) used for RAG.
PASSAGES = [
    ("Acne", "overview", "Acne is a very common skin condition that most people experience at some point. It causes spots and oily skin, and the affected skin can feel hot or painful.", "nhs_acne"),
    ("Acne", "epidemiology", "Acne typically peaks in the mid-to-late teenage years and often settles by the mid-twenties, although it can persist into adulthood.", "nhs_acne"),
    ("Acne", "management", "Management aims to reduce lesion severity, prevent recurrence and avoid scarring. Guideline scope covers skin-care advice, topical treatment classes, oral options and referral to specialist care for severe disease or scarring.", "nice_ng198"),
    ("Acne", "first_line", "For mild acne, a first step is usually a topical treatment applied to the skin, and many young people find one that works; a doctor may refer to a dermatologist if needed.", "gosh_acne"),
    ("Acne", "red_flags", "Help should be sought if acne is severe or makes someone feel unwell, if scarring starts despite treatment, or if it significantly affects quality of life.", "selfcare_acne"),
    ("Eczema", "overview", "Atopic eczema (atopic dermatitis) makes skin itchy, dry, red and cracked. It is usually long-term but can improve or clear in some children as they grow.", "wales_eczema"),
    ("Eczema", "pattern", "People with atopic eczema have quieter periods and flare-ups. Triggers can include soaps, detergents, stress and the weather; it often occurs alongside asthma or hay fever.", "nhs_eczema_children"),
    ("Eczema", "treatment", "Treatment is stepped up or down according to severity. Emollients are the foundation, with topical anti-inflammatory classes for flares; the weakest effective treatment should be used.", "nhs_eczema_tx"),
    ("Eczema", "red_flags", "Painful, rapidly worsening eczema with weeping or crusting may indicate infection or eczema herpeticum and needs urgent medical review.", "wales_eczema"),
    ("Eczema", "referral", "If eczema is severe or not improving despite treatment, a GP may refer to a specialist clinic such as dermatology.", "hwt_eczema"),
    ("Psoriasis", "overview", "Psoriasis is a long-lasting condition with periods of few symptoms followed by flare-ups. Triggers include skin injury, throat infections and some medicines.", "nhs_psoriasis"),
    ("Psoriasis", "symptoms", "The main symptom is dry, itchy, sore and flaky patches that form silvery-white scales; patches are often oval or irregular and around one to two centimetres.", "nhs_psoriasis_sym"),
    ("Psoriasis", "types", "Plaque psoriasis is the most common type and usually appears on elbows, knees, scalp and lower back. Generalised pustular and erythrodermic psoriasis are rare and may need emergency treatment.", "nhs_psoriasis_types"),
    ("Psoriasis", "treatment", "Treatment usually starts with topical options; phototherapy and systemic treatments are used if topical treatment is not enough.", "nhs_psoriasis"),
    ("Psoriasis", "arthritis", "Some people with psoriasis develop psoriatic arthritis, an inflammatory joint condition, so recurring joint pain should be reviewed.", "nhs_psoriasis_sym"),
    ("Melanoma", "symptoms", "Melanoma may appear as a new abnormal mole, a mole that grows or changes, or a change in normal skin. Many melanomas cause no pain or itch.", "cruk_melanoma"),
    ("Melanoma", "abcde", "The ABCDE checklist (asymmetry, border, colour, diameter, evolution) helps flag suspicious pigmented lesions, but it is not very specific and can miss small early melanomas.", "pulse_abcde"),
    ("Melanoma", "normal_mole", "Normal moles are usually round or oval with a smooth edge and are typically no more than about 6 mm wide.", "hse_melanoma"),
    ("Melanoma", "origin", "About half of melanomas start in normal-looking skin rather than in an existing mole.", "christie_melanoma"),
    ("Melanoma", "treatment", "Early melanoma is generally treated by surgical excision; if it has spread, additional treatment classes such as immunotherapy, targeted drugs or radiotherapy may be considered.", "spire_melanoma"),
    ("Basal Cell Carcinoma", "overview", "Basal cell carcinoma is the most common skin cancer. It grows slowly, very rarely spreads and is normally cured with treatment.", "uhl_bcc"),
    ("Basal Cell Carcinoma", "symptoms", "BCC may look like an open sore that does not heal, a reddish irritated patch, or a shiny red, pink or scar-like bump, usually on sun-exposed skin.", "bidmc_bcc"),
    ("Basal Cell Carcinoma", "diagnosis", "Diagnosis is sometimes clear from appearance; otherwise a small skin biopsy confirms the diagnosis and sub-type before definitive treatment.", "bad_bcc"),
    ("Basal Cell Carcinoma", "treatment", "Surgery is the most common treatment for BCC; non-surgical options include photodynamic therapy and radiotherapy depending on size, site and patient factors.", "swbh_bcc"),
    ("Skin Cancer (unspecified)", "general", "A skin abnormality such as a lump, ulcer or discoloured patch that has not healed after about four weeks should be checked by a GP.", "nwcr_skin"),
    ("Seborrheic Keratosis", "overview", "Seborrhoeic keratosis is a harmless warty spot that appears in adult life as a sign of skin ageing; some people have hundreds. Lesions look stuck on to the skin surface.", "dermnet_sk2"),
    ("Seborrheic Keratosis", "epidemiology", "More than 90% of adults over 60 are estimated to have at least one seborrhoeic keratosis; they are uncommon before age 20.", "dermnet_sk"),
    ("Seborrheic Keratosis", "differential", "Seborrhoeic keratosis can sometimes resemble basal cell carcinoma, squamous cell carcinoma or melanoma; if doubt remains a biopsy or excision may be performed.", "dermnet_sk2"),
    ("Seborrheic Keratosis", "management", "A seborrhoeic keratosis does not need removal, but may be removed if unsightly, itchy or catching on clothing.", "dermnet_sk"),
    ("Seborrheic Keratosis", "review", "SK is the most common benign epidermal tumour in dermatology practice; age, genetic predisposition and possibly UV exposure contribute.", "pubmed_sk"),
    ("Dataset", "ham10000", "HAM10000 is a dermoscopic image collection of about 10,000 images across 7 diagnostic categories, labelled through an accompanying metadata file.", "tschandl_ham"),
]
