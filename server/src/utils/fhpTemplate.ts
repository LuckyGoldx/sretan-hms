/**
 * Gordon's 11 Functional Health Patterns — inpatient assessment template.
 *
 * This is the single source of truth for the pattern list and prompts. The
 * client fetches it from GET /api/fhp/template and renders the form; responses
 * are stored keyed by prompt key. Bump `version` whenever prompts change so
 * historical assessments can be interpreted against the template they used.
 */

export type FhpResponseType = 'concern' | 'scale' | 'text';

export interface FhpPrompt {
  key: string;
  label: string;
  /** Critical prompts are highlighted and surface as red flags when present. */
  critical?: boolean;
}

export interface FhpPattern {
  code: string;
  label: string;
  short: string;
  prompts: FhpPrompt[];
}

export const FHP_TEMPLATE_VERSION = '1.0';

export const FHP_PATTERNS: FhpPattern[] = [
  {
    code: 'health_perception',
    label: 'Health Perception – Health Management',
    short: 'Health Perception',
    prompts: [
      { key: 'health_rating', label: 'Self-rated health / current understanding of condition' },
      { key: 'adherence_meds', label: 'Follows medication and treatment plan' },
      { key: 'immunizations', label: 'Immunisations up to date' },
      { key: 'substance_use', label: 'Tobacco / alcohol / substance use' },
      { key: 'previous_admissions', label: 'Recent admissions, surgeries or chronic illness' },
    ],
  },
  {
    code: 'nutrition_metabolic',
    label: 'Nutrition – Metabolic',
    short: 'Nutrition',
    prompts: [
      { key: 'appetite', label: 'Appetite and oral intake adequate' },
      { key: 'diet', label: 'Diet / dietary restrictions (diabetic, renal, allergies)' },
      { key: 'weight_change', label: 'Recent unintended weight change' },
      { key: 'swallowing', label: 'Swallowing difficulty / dysphagia', critical: true },
      { key: 'wound_healing', label: 'Wound healing / impaired skin integrity' },
      { key: 'glucose', label: 'Glucose or electrolyte concerns' },
    ],
  },
  {
    code: 'elimination',
    label: 'Elimination',
    short: 'Elimination',
    prompts: [
      { key: 'bowel', label: 'Bowel pattern — constipation / diarrhoea / frequency' },
      { key: 'bladder', label: 'Bladder pattern — retention / frequency / incontinence' },
      { key: 'catheter', label: 'Catheter / stoma / ostomy in situ', critical: true },
      { key: 'output', label: 'Urine or stool characteristics changed' },
      { key: 'assist', label: 'Needs assistance for toileting' },
    ],
  },
  {
    code: 'activity_exercise',
    label: 'Activity – Exercise',
    short: 'Activity',
    prompts: [
      { key: 'mobility', label: 'Mobility / gait affected' },
      { key: 'adls', label: 'Needs help with ADLs' },
      { key: 'fall_risk', label: 'Fall risk (unsteady, sedated, recent fall)', critical: true },
      { key: 'exercise_tolerance', label: 'Reduced exercise tolerance / dyspnoea' },
      { key: 'assistive_device', label: 'Uses assistive device / needs hoist' },
    ],
  },
  {
    code: 'sleep_rest',
    label: 'Sleep – Rest',
    short: 'Sleep',
    prompts: [
      { key: 'sleep_quality', label: 'Sleep quality / duration poor' },
      { key: 'aids', label: 'Uses sleep aids / sedatives' },
      { key: 'daytime_fatigue', label: 'Daytime fatigue / drowsiness' },
      { key: 'environment', label: 'Environment affecting sleep (noise, pain)' },
    ],
  },
  {
    code: 'cognitive_perceptual',
    label: 'Cognitive – Perceptual',
    short: 'Cognition',
    prompts: [
      { key: 'orientation', label: 'Disoriented / altered level of consciousness', critical: true },
      { key: 'memory', label: 'Memory or attention difficulties' },
      { key: 'pain', label: 'Pain present (site / score)', critical: true },
      { key: 'senses', label: 'Vision / hearing / sensory deficit' },
      { key: 'decision_making', label: 'Decision-making capacity impaired' },
    ],
  },
  {
    code: 'self_perception',
    label: 'Self-Perception – Self-Concept',
    short: 'Self-Perception',
    prompts: [
      { key: 'mood', label: 'Low mood / distress' },
      { key: 'anxiety', label: 'Anxiety or body-image concerns' },
      { key: 'self_esteem', label: 'Low self-esteem / hopelessness' },
      { key: 'coping_style', label: 'Views self as unable to cope' },
    ],
  },
  {
    code: 'role_relationship',
    label: 'Role – Relationship',
    short: 'Role',
    prompts: [
      { key: 'support', label: 'Limited family / social support' },
      { key: 'role', label: 'Illness affects role responsibilities / work' },
      { key: 'caregiver', label: 'Caregiver burden / dependent relatives' },
      { key: 'communication', label: 'Communication or relationship difficulties' },
      { key: 'isolation', label: 'Social isolation' },
    ],
  },
  {
    code: 'sexuality_reproductive',
    label: 'Sexuality – Reproductive',
    short: 'Sexuality',
    prompts: [
      { key: 'reproductive', label: 'Reproductive / menstrual concerns' },
      { key: 'concerns', label: 'Sexual health concerns' },
      { key: 'pregnancy', label: 'Pregnant or lactating' },
      { key: 'contraception', label: 'Contraception / family planning needs' },
    ],
  },
  {
    code: 'coping_stress',
    label: 'Coping – Stress Tolerance',
    short: 'Coping',
    prompts: [
      { key: 'stressors', label: 'Significant current stressors' },
      { key: 'coping', label: 'Coping strategies ineffective' },
      { key: 'crisis', label: 'Acute crisis / self-harm or suicidal ideation', critical: true },
      { key: 'resources', label: 'Lacks coping resources / finances' },
      { key: 'substance_coping', label: 'Uses substances to cope' },
    ],
  },
  {
    code: 'values_beliefs',
    label: 'Values – Beliefs',
    short: 'Values',
    prompts: [
      { key: 'religion', label: 'Religious / spiritual needs to support' },
      { key: 'cultural', label: 'Cultural care needs or preferences' },
      { key: 'directives', label: 'Advance directive / resuscitation wishes', critical: true },
      { key: 'meaning', label: 'Sources of hope or meaning affected' },
    ],
  },
];

export const FHP_PATTERN_CODES = FHP_PATTERNS.map((p) => p.code);

export const FHP_STATUSES = ['effective', 'ineffective', 'at_risk', 'not_assessed'] as const;
export const FHP_ASSESSMENT_TYPES = ['baseline', 'shift', 'discharge'] as const;
