# CordalSur section-theme study

## Claim boundary

This implementation is evidence-informed, not evidence of a biochemical response. Automated checks can prove palette coverage, contrast, reflow and deterministic theme behavior. Only a preregistered study with people can support a causal claim about satisfaction, attraction or intention to reuse CordalSur.

## Design hypothesis

Each guest section keeps the CordalSur forest, gold and ivory foundation while receiving one restrained semantic accent. The accent changes between light and dark so selected controls retain at least a 6:1 text contrast ratio. Information, labels and status never depend on color alone.

The intervention is motivated by three findings:

1. Tractinsky, Katz and Ikar found that interface aesthetics affected post-use perceptions of aesthetics and usability. This supports testing perceived usability, but does not prove actual task performance. DOI: <https://doi.org/10.1016/S0953-5438(00)00031-X>
2. Lavie and Tractinsky identified classical and expressive dimensions of perceived web aesthetics and developed measures for them. DOI: <https://doi.org/10.1016/j.ijhcs.2003.09.002>
3. Hall and Hanna experimentally found that higher text/background contrast generally improved readability; color combinations affected aesthetic ratings and behavioral intention, but not retention. DOI: <https://doi.org/10.1080/01449290410001669932>
4. Moshagen and Thielsch developed the four-item VisAWI-S for brief repeated measurement of overall perceived website aesthetics. Their three studies included 1,673 participants; the short scale retained adequate reliability and closely approximated the full inventory. DOI: <https://doi.org/10.1080/0144929X.2012.694910>

The accessibility floor follows WCAG 2.2 success criteria 1.4.3, 1.4.11 and 1.4.10: <https://www.w3.org/TR/WCAG22/>

## Preregistered comparison

- **Design:** randomized, counterbalanced, within-participant comparison.
- **Control:** the previous uniform CordalSur palette.
- **Treatment:** the section-adaptive palette in `data/section-palettes.json`.
- **Delivery:** opaque same-origin codes preserve access, content and behavior. `condition=a` applies the uniform control and `condition=b` applies the adaptive treatment; the code mapping is kept from participants.
- **Tasks:** find Wi-Fi, identify check-in guidance, choose a restaurant, find an activity, locate a nearby service, read weather, locate ski tickets, review check-out and find emergency guidance.
- **Primary outcome:** mean of four 1–7 aesthetics items representing coherence, variety, colour composition and craftsmanship after completing all tasks.
- **Secondary outcomes:** task success, time on task, error count, perceived usability and intention to reuse.
- **Scale:** use the four-item working Chilean-Spanish translation declared in `study-config.json`; complete the documented translation and cognitive pilot before marking it ready for confirmatory use. Record reuse intention separately on a 7-point scale.
- **Measurement gate:** report Cronbach's alpha separately for each condition. A positive confirmatory verdict requires alpha ≥ .70 in both conditions and a preregistered instrument marked ready before main-data collection.
- **Sample size:** recruit 80 participants to retain at least 72 complete paired sessions. The target concerns power to detect a standardized paired difference of 0.35 against zero; it is not power to place the entire confidence interval above a raw 0.35-point threshold. Do not change the sample after seeing results.
- **Analysis:** regress each treatment-minus-control within-person difference on counterbalanced sequence. The intercept estimates treatment and the sequence coefficient adjusts the period effect. Report 95% confidence intervals and paired `dz`; correct secondary comparisons with Holm's method.
- **Exclusions:** preregister technical failures and incomplete sessions; report every exclusion and missing value.
- **Accessibility:** record device, theme, age band and self-reported color-vision limitations; do not exclude color-vision variation merely to improve the result.

## Decision rule

Adopt the claim “the section palette improves attraction” only when the primary 95% confidence interval is above zero, the instrument and reliability gates pass, task success is non-inferior and errors do not worsen. Reserve the stronger claim “meaningful improvement” for the same result with the full interval above the preregistered raw threshold of 0.35 scale points. Otherwise report the result as incomplete, inconclusive or negative.

The current automated result supports only this statement: all eleven sections have distinct light/dark identities, every selected-state text pair is at least 6:1, and the generated CSS matches the declared palette data.

The locked configuration, anonymous CSV contract and reproducible analysis procedure live in `study-config.json` and `STUDY_RUNBOOK.md`.
