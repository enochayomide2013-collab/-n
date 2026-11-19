import { getAccessToken } from './googleAuth';
import type { FloraSpecimenInfo, TerrariumEnvironmentSnapshot } from '../terrarium/math';

export interface GoogleFormItem {
  itemId?: string;
  title?: string;
  description?: string;
  questionItem?: {
    question?: {
      questionId?: string;
      required?: boolean;
      choiceQuestion?: {
        type?: string;
        options?: Array<{ value: string }>;
      };
      textQuestion?: {
        paragraph?: boolean;
      };
      scaleQuestion?: {
        low: number;
        high: number;
        lowLabel?: string;
        highLabel?: string;
      };
    };
  };
}

export interface GoogleFormResource {
  formId: string;
  info: {
    title: string;
    documentTitle?: string;
    description?: string;
  };
  responderUri: string;
  items?: GoogleFormItem[];
}

export interface GoogleFormResponseItem {
  responseId: string;
  createTime: string;
  lastSubmittedTime: string;
  respondentEmail?: string;
  answers?: Record<
    string,
    {
      questionId: string;
      textAnswers?: {
        answers: Array<{ value: string }>;
      };
    }
  >;
}

const FORMS_BASE = 'https://forms.googleapis.com/v1/forms';

export function extractFormId(input: string): string {
  const trimmed = input.trim();
  const match = trimmed.match(/\/forms\/d\/(?:e\/)?([a-zA-Z0-9_-]+)/);
  if (match && match[1]) {
    return match[1];
  }
  return trimmed;
}

async function formsFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const token = await getAccessToken();
  if (!token) {
    throw new Error('Please sign in with Google to access Google Forms.');
  }

  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  if (!res.ok) {
    let message = `Google Forms request failed (${res.status})`;
    try {
      const errData = await res.json();
      if (errData?.error?.message) {
        message = errData.error.message;
      }
    } catch {
      // ignore non-json error bodies
    }
    throw new Error(message);
  }

  return (await res.json()) as T;
}

export function buildTerrariumCareRequests(
  snapshot: TerrariumEnvironmentSnapshot,
  specimens: FloraSpecimenInfo[]
) {
  const speciesOptions = specimens
    .slice(0, 8)
    .map((s) => ({ value: `${s.commonName} (${s.latinName})` }));

  if (speciesOptions.length === 0) {
    speciesOptions.push({ value: 'Maidenhair Fern (Adiantum raddianum)' });
  }

  const infoSummary = `Seed #${snapshot.seed} · Weather: ${snapshot.weather} · Light: ${snapshot.timeLabel} · Humidity: ${snapshot.humidity}% · Temp: ${snapshot.temperatureC.toFixed(1)}°C`;

  return [
    {
      updateFormInfo: {
        info: {
          title: `Verdant Conservatory Care Log — Seed #${snapshot.seed}`,
          description: `Botanical care and observation checklist generated from your 3D Wardian terrarium (${infoSummary}).`,
        },
        updateMask: 'description',
      },
    },
    {
      createItem: {
        item: {
          title: 'Which botanical specimens were inspected today?',
          description: 'Select all active flora specimens checked inside the enclosure.',
          questionItem: {
            question: {
              required: true,
              choiceQuestion: {
                type: 'CHECKBOX',
                options: speciesOptions,
              },
            },
          },
        },
        location: { index: 0 },
      },
    },
    {
      createItem: {
        item: {
          title: 'Observed Canopy & Soil Moisture Condition',
          questionItem: {
            question: {
              required: true,
              choiceQuestion: {
                type: 'RADIO',
                options: [
                  { value: 'Crisp & Dry — Needs Misting' },
                  { value: 'Balanced Morning Dew (Optimal)' },
                  { value: 'Heavy Condensation — Open Roof Vent' },
                ],
              },
            },
          },
        },
        location: { index: 1 },
      },
    },
    {
      createItem: {
        item: {
          title: 'Overall Terrarium Vitality Score',
          questionItem: {
            question: {
              required: false,
              scaleQuestion: {
                low: 1,
                high: 5,
                lowLabel: 'Needs Attention',
                highLabel: 'Thriving',
              },
            },
          },
        },
        location: { index: 2 },
      },
    },
    {
      createItem: {
        item: {
          title: 'Maintenance Actions & Botanical Notes',
          description: `Reference snapshot: ${infoSummary}`,
          questionItem: {
            question: {
              required: false,
              textQuestion: {
                paragraph: true,
              },
            },
          },
        },
        location: { index: 3 },
      },
    },
  ];
}

export async function createTerrariumCareForm(
  snapshot: TerrariumEnvironmentSnapshot,
  specimens: FloraSpecimenInfo[]
): Promise<GoogleFormResource> {
  const title = `Verdant Conservatory Care Log — Seed #${snapshot.seed}`;
  const created = await formsFetch<GoogleFormResource>(FORMS_BASE, {
    method: 'POST',
    body: JSON.stringify({
      info: {
        title,
        documentTitle: title,
      },
    }),
  });

  const safeFormId = encodeURIComponent(created.formId.trim());
  const requests = buildTerrariumCareRequests(snapshot, specimens);

  await formsFetch(`${FORMS_BASE}/${safeFormId}:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify({
      includeFormInResponse: true,
      requests,
    }),
  });

  return getForm(created.formId);
}

export async function getForm(formId: string): Promise<GoogleFormResource> {
  const safeFormId = encodeURIComponent(extractFormId(formId));
  return formsFetch<GoogleFormResource>(`${FORMS_BASE}/${safeFormId}`);
}

export async function listFormResponses(
  formId: string
): Promise<GoogleFormResponseItem[]> {
  const safeFormId = encodeURIComponent(extractFormId(formId));
  const data = await formsFetch<{ responses?: GoogleFormResponseItem[] }>(
    `${FORMS_BASE}/${safeFormId}/responses`
  );
  return data.responses ?? [];
}

export async function appendSnapshotQuestionToForm(
  formId: string,
  snapshot: TerrariumEnvironmentSnapshot,
  itemIndex: number
): Promise<GoogleFormResource> {
  const safeFormId = encodeURIComponent(extractFormId(formId));
  const summary = `Seed #${snapshot.seed} · ${snapshot.timeLabel} · ${snapshot.weather} · ${snapshot.humidity}% RH · ${snapshot.temperatureC.toFixed(1)}°C`;

  await formsFetch(`${FORMS_BASE}/${safeFormId}:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify({
      requests: [
        {
          createItem: {
            item: {
              title: `Observation Check-In (${snapshot.timeLabel} · ${snapshot.weather})`,
              description: `Captured terrarium telemetry: ${summary}`,
              questionItem: {
                question: {
                  required: false,
                  textQuestion: { paragraph: true },
                },
              },
            },
            location: { index: Math.max(0, itemIndex) },
          },
        },
      ],
    }),
  });

  return getForm(formId);
}
