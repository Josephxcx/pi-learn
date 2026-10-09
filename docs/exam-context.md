# Exam context for Mizoram and central recruitment

The teaching standard comes from the exact recruitment notification, post/service rules, current syllabus, paper, and representative past questions. “Mizoram exam”, “central exam”, or a group classification alone is insufficient to choose a syllabus or difficulty.

## Keep administrative facts separate

| Field | What it identifies | What it does not establish |
| --- | --- | --- |
| Post or service | The job/service being recruited to | A uniform paper pattern across authorities or years |
| Recruiting authority | MPSC, a department, UPSC, SSC, or another named body | The post's group or gazetted status by itself |
| Group | Classification under the applicable government's/service's rules | A fixed GS/English difficulty or one recruitment route |
| Gazetted status | Whether the post is gazetted under the applicable rules | A synonym for Group B, officer, or a particular pay level |
| Recruitment route | Open/direct recruitment, LDE, promotion examination, qualifying examination, or another notified route | Whether marks enter the final merit list |
| Syllabus version and paper | The examinable topics, format, and applicable version | The answer to every content question without subject sources |
| Difficulty guidance | Depth inferred from that syllabus and relevant paper evidence | A prediction of the next examination |

Keep gazetted status separate from group: Group B may include gazetted and non-gazetted posts, depending on the rules. Do not infer either field from a title alone. Use `gazetted: "unknown"` or omit the value until sourced. Educational eligibility can help identify prerequisites; it is not a full description of question difficulty.

### Group D needs jurisdiction and date

Do not erase “Group D” from a Mizoram/state notice just because central recruitment terminology changed. The central Sixth Central Pay Commission reforms upgraded erstwhile Group D posts into Group C in their applicable scope. That history does not establish the classification of every state post, older notification, autonomous body, or exceptional service. For a present post, use the applicable notification and recruitment/classification rules, with their effective dates.

### Open, departmental, and qualifying are different dimensions

An open examination draws candidates from the notified eligible pool. A limited departmental examination restricts eligibility to specified serving personnel and may test service-specific procedures, accounts, rules, or duties. Do not reuse a similarly named open-recruitment syllabus for an LDE.

“Qualifying” describes a pass requirement and often how a paper's marks are treated. It can describe a paper within a larger examination; it is not necessarily a mutually exclusive alternative to open recruitment or departmental recruitment. Read the notification to establish pass marks, whether marks count for merit, exemptions, and negative marking. Unknown values must remain unknown.

## Use the profile without burdening the learner

The tutor can collect context in ordinary conversation, such as “MPSC, this post, the 2026 notification, English paper.” It should reuse facts already supplied. The learner does not need to write configuration or understand a schema.

`init_learning_session` accepts an optional `examId` and an `examProfile` with these fields:

```json
{
  "id": "learner-selected-exam-id",
  "post": "Exact notified post",
  "authority": "Exact recruiting authority",
  "group": "Classification copied from the applicable rules",
  "gazetted": "unknown",
  "recruitmentRoute": "Route stated in the notification",
  "syllabusVersion": "Document title, year/version, or notification date",
  "paper": "Exact paper title",
  "difficultyGuidance": "Depth supported by syllabus wording and identified papers"
}
```

This is a field guide, not a real exam profile. Omit unknown fields; do not copy these placeholders into a learner's record. Keep a stable ID for a configured exam and make an explicit choice if multiple exams are available. If supplying both `examId` and `examProfile.id`, use the same value. Store the actual document links and provision/page references with the lesson's `sources` and explanation.

A general lesson needs only a topic and goal. A lesson begun before the exact paper is identified should say its exam mapping is provisional, teach useful foundations, and defer claims about weightage or expected depth.

## Syllabus first, then evidence from papers

1. Obtain the official syllabus and the applicable notification. Confirm the post, route, year/version, stages, papers, marks, duration, negative marking, and qualifying conditions that the documents actually provide.
2. Map the chosen topic to its exact unit or syllabus wording. Do not add a topic just because it appears in another recruitment exam.
3. Inspect relevant papers and official keys. Preserve exam, sitting/year, paper, question number, source identity, and mapping confidence. Identify a practice question as practice rather than as a PYQ.
4. Use repeated appearances as evidence of coverage in the available sample. Duplicate scans or booklets from the same sitting do not create additional frequency; genuinely repeated questions in different sittings still count as separate evidence.
5. State coverage and limitations with recommendations. Missing PYQs do not establish a new syllabus; a count across years alone does not establish a rising trend. An uncertain mapping remains uncertain.

An appropriate GS lesson might teach a fact, a distinction, and a statement-based application. A different paper might require only identification, or demand a written evaluation. For English, inspect whether the paper tests grammar/usage, comprehension, vocabulary, précis, essay, or other tasks before building a plan. Neither subject should be taught at a guessed uniform “government exam level”.

## Official starting points

- [Mizoram Public Service Commission](https://mpsc.mizoram.gov.in/): select the relevant examination and notification, then use the [syllabus hub](https://mpsc.mizoram.gov.in/page/syllabus), [non-gazetted syllabus hub](https://mpsc.mizoram.gov.in/page/syllabus-ng), and the applicable question-paper/answer-key archive. The site's document titles and effective dates matter more than a search snippet.
- [Constitution of India, Legislative Department](https://legislative.gov.in/constitution-of-india/): use the applicable consolidated text and article references for constitutional lessons.
- [Union Public Service Commission](https://upsc.gov.in/): consult the relevant examination notice, syllabus, and papers for UPSC recruitment.
- [Staff Selection Commission](https://ssc.gov.in/): use the relevant current examination notice and official syllabus for SSC recruitment.
- [Department of Personnel and Training](https://dopt.gov.in/): consult applicable central classification and recruitment rules; do not substitute central instructions for Mizoram rules.

These portals are source entry points. A link alone is not evidence that a specific document was inspected, and this extension does not supply a complete or continuously updated examination library.

For historical support of the classification cautions, [DoPT's Central Secretariat Service recruitment page](https://csdiv.dopt.gov.in/DOPT/CSWing/CSDivision/CSS/Recruitment.htm) distinguishes Group B gazetted Section Officers from Group B non-gazetted Assistants. A [Rajya Sabha legislative-history compilation](https://cms.rajyasabha.nic.in/UploadedFiles/ElectronicPublications/Lokpal_LokayuAct%202013.pdf), printed p. 273, records DoPT's explanation of the central Group D merger following the Sixth Pay Commission. These historical sources do not replace current rules for the learner's selected post.
