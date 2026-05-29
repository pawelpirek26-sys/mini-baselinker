/**
 * MappingService
 * --------------
 * Interpoluje szablon `fieldMapping` + `portalConfig` na konkretne dane z Part.
 *
 * Składnia szablonu:
 *  - "{{pole}}"        → wartość pola Part (interpolacja w stringu)
 *  - "pole"            → bezpośrednia referencja do pola Part
 *  - wartość statyczna → zwracana as-is
 */

import type { Part, Compatibility, PartImage } from '../utils/types';

type PartFull = Part & {
  images:        PartImage[];
  compatibility: Compatibility[];
};

/** Zamień {{pole}} na wartości z obiektu */
export function interpolate(template: string, data: Record<string, unknown>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const val = data[key];
    return val != null ? String(val) : '';
  });
}

/** Spłaszcz Part do płaskiego rekordu kluczy */
function flattenPart(part: PartFull): Record<string, unknown> {
  const techParams = part.technicalParams
    ? (JSON.parse(part.technicalParams) as Record<string, unknown>)
    : {};

  return {
    ...part,
    ...techParams,
    // Aliasy przyjazne szablonowi
    condition_pl:
      part.condition === 'NEW' ? 'Nowa'
      : part.condition === 'REGENERATED' ? 'Regenerowana'
      : 'Używana',
    compatibility_text: part.compatibility
      .map((c: Compatibility) => [c.brand, c.series, c.model, c.yearFrom, c.yearTo ? `– ${c.yearTo}` : ''].filter(Boolean).join(' '))
      .join('\n'),
    cover_image_url: part.images.find((i) => i.isCover)?.url ?? part.images[0]?.url ?? '',
    image_urls:      part.images.map((i) => i.url),
  };
}

/** Wykonaj mapowanie pól dla danego portalu */
export function applyFieldMapping(
  part:         PartFull,
  fieldMapping: Record<string, unknown>,
): Record<string, unknown> {
  const flat   = flattenPart(part);
  const result: Record<string, unknown> = {};

  for (const [targetKey, rule] of Object.entries(fieldMapping)) {
    if (typeof rule === 'string') {
      if (rule.includes('{{')) {
        // Interpolacja: "{{name}} OEM:{{oemNumber}}"
        result[targetKey] = interpolate(rule, flat);
      } else if (rule in flat) {
        // Bezpośrednia referencja do pola Part
        result[targetKey] = flat[rule];
      } else {
        // Wartość statyczna
        result[targetKey] = rule;
      }
    } else {
      // Przekaż as-is (number, boolean, array…)
      result[targetKey] = rule;
    }
  }

  return result;
}

/** Buduj opis HTML z danych części */
export function buildHtmlDescription(part: PartFull): string {
  const params = part.technicalParams
    ? (JSON.parse(part.technicalParams) as Record<string, string>)
    : null;

  const compat = part.compatibility;

  let html = '';

  if (part.descriptionLong) {
    html += part.descriptionLong;
  } else if (part.descriptionShort) {
    html += `<p>${part.descriptionShort}</p>`;
  }

  if (params && Object.keys(params).length) {
    html += '<h3>Parametry techniczne</h3><table>';
    for (const [k, v] of Object.entries(params)) {
      html += `<tr><th>${k}</th><td>${v}</td></tr>`;
    }
    html += '</table>';
  }

  if (compat.length) {
    html += '<h3>Kompatybilność pojazdów</h3><ul>';
    for (const c of compat) {
      const line = [c.brand, c.series, c.model, c.yearFrom, c.yearTo ? `– ${c.yearTo}` : '']
        .filter(Boolean).join(' ');
      html += `<li>${line}</li>`;
    }
    html += '</ul>';
  }

  return html || `<p>${part.name}</p>`;
}

/** Mapuj condition Part → Allegro condition */
export function mapConditionToAllegro(condition: string): 'NEW' | 'USED' {
  return condition === 'NEW' ? 'NEW' : 'USED';
}
