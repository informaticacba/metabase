import MetabaseSettings from "metabase/lib/settings";
import type {
  TemplateTag,
  LocalFieldReference,
  ForeignFieldReference,
  FieldFilter,
} from "metabase-types/types/Query";
import type {
  Parameter,
  ParameterOption,
  ParameterInstance,
  ParameterTarget,
  ParameterValue,
  ParameterValueOrArray,
} from "metabase-types/types/Parameter";
import type { FieldId } from "metabase-types/types/Field";
import type Metadata from "metabase-lib/lib/metadata/Metadata";
import type Field from "metabase-lib/lib/metadata/Field";
import Dimension, {
  FieldDimension,
  TemplateTagDimension,
} from "metabase-lib/lib/Dimension";
import moment from "moment";
import { t } from "ttag";
import _ from "underscore";
import {
  doesOperatorExist,
  getOperatorByTypeAndName,
  STRING,
  NUMBER,
  PRIMARY_KEY,
} from "metabase/lib/schema_metadata";

import Variable, { TemplateTagVariable } from "metabase-lib/lib/Variable";

type DimensionFilter = (dimension: Dimension) => boolean;
type TemplateTagFilter = (tag: TemplateTag) => boolean;
type FieldPredicate = (field: Field) => boolean;
type VariableFilter = (variable: Variable) => boolean;

const areFieldFilterOperatorsEnabled = () =>
  MetabaseSettings.get("field-filter-operators-enabled?");

export const PARAMETER_OPERATOR_TYPES = {
  number: [
    {
      type: "number/=",
      operator: "=",
      name: t`Equal to`,
    },
    {
      type: "number/!=",
      operator: "!=",
      name: t`Not equal to`,
    },
    {
      type: "number/between",
      operator: "between",
      name: t`Between`,
    },
    {
      type: "number/>=",
      operator: ">=",
      name: t`Greater than or equal to`,
    },
    {
      type: "number/<=",
      operator: "<=",
      name: t`Less than or equal to`,
    },
  ],
  string: [
    {
      type: "string/=",
      operator: "=",
      name: t`Dropdown`,
      description: t`Select one or more values from a list or search box.`,
    },
    {
      type: "string/!=",
      operator: "!=",
      name: t`Is not`,
      description: t`Exclude one or more specific values.`,
    },
    {
      type: "string/contains",
      operator: "contains",
      name: t`Contains`,
      description: t`Match values that contain the entered text.`,
    },
    {
      type: "string/does-not-contain",
      operator: "does-not-contain",
      name: t`Does not contain`,
      description: t`Filter out values that contain the entered text.`,
    },
    {
      type: "string/starts-with",
      operator: "starts-with",
      name: t`Starts with`,
      description: t`Match values that begin with the entered text.`,
    },
    {
      type: "string/ends-with",
      operator: "ends-with",
      name: t`Ends with`,
      description: t`Match values that end with the entered text.`,
    },
  ],
  date: [
    {
      type: "date/month-year",
      operator: "month-year",
      name: t`Month and Year`,
      description: t`Like January, 2016`,
    },
    {
      type: "date/quarter-year",
      operator: "quarter-year",
      name: t`Quarter and Year`,
      description: t`Like Q1, 2016`,
    },
    {
      type: "date/single",
      operator: "single",
      name: t`Single Date`,
      description: t`Like January 31, 2016`,
    },
    {
      type: "date/range",
      operator: "range",
      name: t`Date Range`,
      description: t`Like December 25, 2015 - February 14, 2016`,
    },
    {
      type: "date/relative",
      operator: "relative",
      name: t`Relative Date`,
      description: t`Like "the last 7 days" or "this month"`,
    },
    {
      type: "date/all-options",
      operator: "all-options",
      name: t`Date Filter`,
      menuName: t`All Options`,
      description: t`Contains all of the above`,
    },
  ],
};

const OPTIONS_WITH_OPERATOR_SUBTYPES = [
  {
    type: "date",
    typeName: t`Date`,
  },
  {
    type: "string",
    typeName: t`String`,
  },
  {
    type: "number",
    typeName: t`Number`,
  },
];

export function getParameterOptions(): ParameterOption[] {
  return [
    {
      type: "id",
      name: t`ID`,
    },
    ...(areFieldFilterOperatorsEnabled()
      ? OPTIONS_WITH_OPERATOR_SUBTYPES.map(option =>
          buildOperatorSubtypeOptions(option),
        )
      : [
          { type: "category", name: t`Category` },
          {
            type: "location/city",
            name: t`City`,
          },
          {
            type: "location/state",
            name: t`State`,
          },
          {
            type: "location/zip_code",
            name: t`ZIP or Postal Code`,
          },
          {
            type: "location/country",
            name: t`Country`,
          },
          ...PARAMETER_OPERATOR_TYPES["date"],
        ]),
  ].flat();
}

function buildOperatorSubtypeOptions({ type, typeName }) {
  return PARAMETER_OPERATOR_TYPES[type].map(option => ({
    ...option,
    combinedName: getOperatorDisplayName(option, type, typeName),
  }));
}

export function getOperatorDisplayName(option, operatorType, sectionName) {
  if (operatorType === "date" || operatorType === "number") {
    return option.name;
  } else if (operatorType === "string" && option.operator === "=") {
    return sectionName;
  } else {
    return `${sectionName} ${option.name.toLowerCase()}`;
  }
}

// sectionId will match a type of field (category, location, number, date, id, etc.)
// if sectionId is undefined, it is an old parameter that did have it set
// OR it is a PARAMETER_OPTION entry. In those situations,
// a `type` will exist like "category" or "location/city" or "string/="
// we split on the `/` and take the first entry to get the field type
function getParameterType(parameter) {
  const { sectionId } = parameter;
  return sectionId || splitType(parameter)[0];
}

function getParameterSubType(parameter) {
  const [, subtype] = splitType(parameter);
  return subtype;
}

function fieldFilterForParameter(parameter: Parameter): FieldPredicate {
  const type = getParameterType(parameter);
  const subtype = getParameterSubType(parameter);
  switch (type) {
    case "date":
      return (field: Field) => field.isDate();
    case "id":
      return (field: Field) => field.isID();
    case "category":
      return (field: Field) => field.isCategory();
    case "location":
      return (field: Field) => {
        switch (subtype) {
          case "city":
            return field.isCity();
          case "state":
            return field.isState();
          case "zip_code":
            return field.isZipCode();
          case "country":
            return field.isCountry();
          default:
            return field.isLocation();
        }
      };
    case "number":
      return (field: Field) => field.isNumber() && !field.isCoordinate();
    case "string":
      return (field: Field) => {
        return subtype === "=" || subtype === "!="
          ? field.isCategory() && !field.isLocation()
          : field.isString() && !field.isLocation();
      };
  }

  return (field: Field) => false;
}

export function parameterOptionsForField(field: Field): ParameterOption[] {
  return getParameterOptions()
    .filter(option => fieldFilterForParameter(option)(field))
    .map(option => {
      return {
        ...option,
        name: option.combinedName || option.name,
      };
    });
}

export function dimensionFilterForParameter(
  parameter: Parameter,
): DimensionFilter {
  const fieldFilter = fieldFilterForParameter(parameter);
  return dimension => fieldFilter(dimension.field());
}

export function getTagOperatorFilterForParameter(parameter) {
  const subtype = getParameterSubType(parameter);
  const parameterOperatorName = getParameterOperatorName(subtype);

  return tag => {
    const { "widget-type": widgetType } = tag;
    const subtype = getParameterSubType(widgetType);
    const tagOperatorName = getParameterOperatorName(subtype);

    return parameterOperatorName === tagOperatorName;
  };
}

export function variableFilterForParameter(
  parameter: Parameter,
): VariableFilter {
  const tagFilter = tagFilterForParameter(parameter);
  return variable => {
    if (variable instanceof TemplateTagVariable) {
      const tag = variable.tag();
      return tag ? tagFilter(tag) : false;
    }
    return false;
  };
}

function tagFilterForParameter(parameter: Parameter): TemplateTagFilter {
  const type = getParameterType(parameter);
  const subtype = getParameterSubType(parameter);
  const operator = getParameterOperatorName(subtype);
  if (operator !== "=") {
    return (tag: TemplateTag) => false;
  }

  switch (type) {
    case "date":
      return (tag: TemplateTag) => subtype === "single" && tag.type === "date";
    case "location":
      return (tag: TemplateTag) => tag.type === "number" || tag.type === "text";
    case "id":
      return (tag: TemplateTag) => tag.type === "number" || tag.type === "text";
    case "category":
      return (tag: TemplateTag) => tag.type === "number" || tag.type === "text";
    case "number":
      return (tag: TemplateTag) => tag.type === "number";
    case "string":
      return (tag: TemplateTag) => tag.type === "text";
  }
  return (tag: TemplateTag) => false;
}

// NOTE: this should mirror `template-tag-parameters` in src/metabase/api/embed.clj
export function getTemplateTagParameters(tags: TemplateTag[]): Parameter[] {
  function getTemplateTagType(tag) {
    const { type } = tag;
    if (type === "date") {
      return "date/single";
    } else if (areFieldFilterOperatorsEnabled() && type === "string") {
      return "string/=";
    } else if (areFieldFilterOperatorsEnabled() && type === "number") {
      return "number/=";
    } else {
      return "category";
    }
  }

  return tags
    .filter(
      tag =>
        tag.type != null && (tag["widget-type"] || tag.type !== "dimension"),
    )
    .map(tag => {
      return {
        id: tag.id,
        type: tag["widget-type"] || getTemplateTagType(tag),
        target:
          tag.type === "dimension"
            ? ["dimension", ["template-tag", tag.name]]
            : ["variable", ["template-tag", tag.name]],
        name: tag["display-name"],
        slug: tag.name,
        default: tag.default,
      };
    });
}

function isDimensionTarget(target) {
  return target?.[0] === "dimension";
}

export function getParameterTargetField(
  target: ?ParameterTarget,
  metadata,
  question,
): ?FieldId {
  if (isDimensionTarget(target)) {
    const dimension = Dimension.parseMBQL(
      target[1],
      metadata,
      question.query(),
    );

    return dimension?.field();
  }

  return null;
}

type Deserializer = { testRegex: RegExp, deserialize: DeserializeFn };
type DeserializeFn = (
  match: any[],
  fieldRef: LocalFieldReference | ForeignFieldReference,
) => FieldFilter;

const withTemporalUnit = (fieldRef, unit) => {
  const dimension =
    (fieldRef && FieldDimension.parseMBQLOrWarn(fieldRef)) ||
    new FieldDimension(null);

  return dimension.withTemporalUnit(unit).mbql();
};

const timeParameterValueDeserializers: Deserializer[] = [
  {
    testRegex: /^past([0-9]+)([a-z]+)s(~)?$/,
    deserialize: (matches, fieldRef) =>
      ["time-interval", fieldRef, -parseInt(matches[0]), matches[1]].concat(
        matches[2] ? [{ "include-current": true }] : [],
      ),
  },
  {
    testRegex: /^next([0-9]+)([a-z]+)s(~)?$/,
    deserialize: (matches, fieldRef) =>
      ["time-interval", fieldRef, parseInt(matches[0]), matches[1]].concat(
        matches[2] ? [{ "include-current": true }] : [],
      ),
  },
  {
    testRegex: /^this([a-z]+)$/,
    deserialize: (matches, fieldRef) => [
      "time-interval",
      fieldRef,
      "current",
      matches[0],
    ],
  },
  {
    testRegex: /^~([0-9-T:]+)$/,
    deserialize: (matches, fieldRef) => ["<", fieldRef, matches[0]],
  },
  {
    testRegex: /^([0-9-T:]+)~$/,
    deserialize: (matches, fieldRef) => [">", fieldRef, matches[0]],
  },
  {
    testRegex: /^(\d{4}-\d{2})$/,
    deserialize: (matches, fieldRef) => [
      "=",
      withTemporalUnit(fieldRef, "month"),
      moment(matches[0], "YYYY-MM").format("YYYY-MM-DD"),
    ],
  },
  {
    testRegex: /^(Q\d-\d{4})$/,
    deserialize: (matches, fieldRef) => [
      "=",
      withTemporalUnit(fieldRef, "quarter"),
      moment(matches[0], "[Q]Q-YYYY").format("YYYY-MM-DD"),
    ],
  },
  {
    testRegex: /^([0-9-T:]+)$/,
    deserialize: (matches, fieldRef) => ["=", fieldRef, matches[0]],
  },
  {
    testRegex: /^([0-9-T:]+)~([0-9-T:]+)$/,
    deserialize: (matches, fieldRef) => [
      "between",
      fieldRef,
      matches[0],
      matches[1],
    ],
  },
];

export function dateParameterValueToMBQL(
  parameterValue: ParameterValue,
  fieldRef: LocalFieldReference | ForeignFieldReference,
): ?FieldFilter {
  const deserializer: ?Deserializer = timeParameterValueDeserializers.find(
    des => des.testRegex.test(parameterValue),
  );

  if (deserializer) {
    const substringMatches = deserializer.testRegex
      .exec(parameterValue)
      .splice(1);
    return deserializer.deserialize(substringMatches, fieldRef);
  } else {
    return null;
  }
}

export function stringParameterValueToMBQL(
  parameter: Parameter,
  fieldRef: LocalFieldReference | ForeignFieldReference,
): ?FieldFilter {
  const parameterValue: ParameterValueOrArray = parameter.value;
  const subtype = getParameterSubType(parameter);
  const operatorName = getParameterOperatorName(subtype);

  return [operatorName, fieldRef].concat(parameterValue);
}

export function numberParameterValueToMBQL(
  parameter: ParameterInstance,
  fieldRef: LocalFieldReference | ForeignFieldReference,
): ?FieldFilter {
  const parameterValue: ParameterValue = parameter.value;
  const subtype = getParameterSubType(parameter);
  const operatorName = getParameterOperatorName(subtype);

  return [operatorName, fieldRef].concat(
    [].concat(parameterValue).map(v => parseFloat(v)),
  );
}

function isDateParameter(parameter) {
  const type = getParameterType(parameter);
  return type === "date";
}

/** compiles a parameter with value to an MBQL clause */
export function parameterToMBQLFilter(
  parameter: ParameterInstance,
  metadata: Metadata,
): ?FieldFilter {
  if (
    !parameter.target ||
    !isDimensionTarget(parameter.target) ||
    !Array.isArray(parameter.target[1]) ||
    TemplateTagDimension.isTemplateTagClause(parameter.target[1])
  ) {
    return null;
  }

  const dimension = Dimension.parseMBQL(parameter.target[1], metadata);
  const field = dimension.field();
  const fieldRef = dimension.mbql();

  if (isDateParameter(parameter)) {
    return dateParameterValueToMBQL(parameter.value, fieldRef);
  } else if (field.isNumeric()) {
    return numberParameterValueToMBQL(parameter, fieldRef);
  } else {
    return stringParameterValueToMBQL(parameter, fieldRef);
  }
}

export function getParameterIconName(parameter: ?Parameter) {
  const type = getParameterType(parameter);
  switch (type) {
    case "date":
      return "calendar";
    case "location":
      return "location";
    case "category":
      return "string";
    case "number":
      return "number";
    case "id":
    default:
      return "label";
  }
}

export function normalizeParameterValue(type, value) {
  const [fieldType] = splitType(type);

  if (["string", "number"].includes(fieldType)) {
    return value == null ? [] : [].concat(value);
  } else {
    return value;
  }
}

function getParameterOperatorName(maybeOperatorName) {
  return doesOperatorExist(maybeOperatorName) ? maybeOperatorName : "=";
}

export function deriveFieldOperatorFromParameter(parameter) {
  const type = getParameterType(parameter);
  const subtype = getParameterSubType(parameter);
  const operatorType = getParameterOperatorType(type);
  const operatorName = getParameterOperatorName(subtype);

  return getOperatorByTypeAndName(operatorType, operatorName);
}

function getParameterOperatorType(parameterType) {
  switch (parameterType) {
    case "number":
      return NUMBER;
    case "string":
    case "category":
    case "location":
      return STRING;
    case "id":
      // id can technically be a FK but doesn't matter as both use default filter operators
      return PRIMARY_KEY;
    default:
      return undefined;
  }
}

function splitType(parameterOrType) {
  const parameterType = _.isString(parameterOrType)
    ? parameterOrType
    : (parameterOrType || {}).type || "";
  return parameterType.split("/");
}

export function getValuePopulatedParameters(parameters, parameterValues) {
  return parameterValues
    ? parameters.map(parameter => {
        return parameter.id in parameterValues
          ? {
              ...parameter,
              value: parameterValues[parameter.id],
            }
          : parameter;
      })
    : parameters;
}

export function hasDefaultParameterValue(parameter) {
  return parameter.default != null;
}

export function hasParameterValue(value) {
  return value != null;
}

export function getParameterValueFromQueryParams(
  parameter,
  queryParams,
  metadata,
) {
  queryParams = queryParams || {};

  const fields = getFields(parameter, metadata);
  const maybeParameterValue = queryParams[parameter.slug];

  if (hasParameterValue(maybeParameterValue)) {
    const parsedValue = parseParameterValueForFields(
      maybeParameterValue,
      fields,
    );
    return normalizeParameterValueForWidget(parsedValue, parameter);
  } else {
    return parameter.default;
  }
}

function parseParameterValueForFields(value, fields) {
  if (Array.isArray(value)) {
    return value.map(v => parseParameterValueForFields(v, fields));
  }

  // [].every is always true, so only check if there are some fields
  if (fields.length > 0) {
    // unix dates fields are numeric but query params shouldn't be parsed as numbers
    if (fields.every(f => f.isNumeric() && !f.isDate())) {
      return parseFloat(value);
    }

    if (fields.every(f => f.isBoolean())) {
      return value === "true" ? true : value === "false" ? false : value;
    }
  }

  return value;
}

function normalizeParameterValueForWidget(value, parameter) {
  // ParameterValueWidget uses FieldValuesWidget if there's no available
  // date widget and all targets are fields.
  const willUseFieldValuesWidget =
    parameter.hasOnlyFieldTargets && !/^date\//.test(parameter.type);

  // If we'll use FieldValuesWidget, we should start with an array to match.
  if (willUseFieldValuesWidget && !Array.isArray(value) && value !== "") {
    value = [value];
  }

  return value;
}

// field IDs can be either
// ["field", <integer-id>, <options>] or
// ["field", <string-name>, <options>]
function getFields(parameter, metadata) {
  if (parameter.fields) {
    return parameter.fields;
  }

  const fieldIds =
    parameter.field_ids || [parameter.field_id].filter(f => f != null);

  return fieldIds
    .map(id => {
      const field = metadata.field(id);
      if (field != null) {
        return field;
      }

      const dimension = Dimension.parseMBQL(id, metadata);
      if (dimension != null) {
        return dimension.field();
      }
    })
    .filter(field => field != null);
}

// on dashboards we treat a default parameter with a set value of "" (from a query parameter)
// to mean that the parameter value is explicitly unset.
// this is NOT the case elsewhere (native questions, pulses) because default values are
// automatically used in the query when unset.
function removeAllEmptyStringParameters(pairs) {
  return pairs
    .map(([parameter, value]) => [parameter, value === "" ? undefined : value])
    .filter(([parameter, value]) => hasParameterValue(value));
}

function removeUndefaultedEmptyStringParameters(pairs) {
  return pairs
    .map(([parameter, value]) => [
      parameter,
      value === "" ? parameter.default : value,
    ])
    .filter(([, value]) => hasParameterValue(value));
}

// when `forcefullyUnsetDefaultedParametersWithEmptyStringValue` is true, we treat defaulted parameters with an empty string value as explecitly unset.
// This CAN'T be used with native questions because defaulted parameters are always applied on the BE when unset on the FE.
export function getParameterValuesByIdFromQueryParams(
  parameters,
  queryParams,
  metadata,
  { forcefullyUnsetDefaultedParametersWithEmptyStringValue } = {},
) {
  const parameterValuePairs = parameters.map(parameter => [
    parameter,
    getParameterValueFromQueryParams(parameter, queryParams, metadata),
  ]);

  const transformedPairs = forcefullyUnsetDefaultedParametersWithEmptyStringValue
    ? removeAllEmptyStringParameters(parameterValuePairs)
    : removeUndefaultedEmptyStringParameters(parameterValuePairs);

  const idValuePairs = transformedPairs.map(([parameter, value]) => [
    parameter.id,
    value,
  ]);

  return Object.fromEntries(idValuePairs);
}

function removeNilValuedPairs(pairs) {
  return pairs.filter(([, value]) => hasParameterValue(value));
}

function removeUndefaultedNilValuedPairs(pairs) {
  return pairs.filter(
    ([parameter, value]) =>
      hasDefaultParameterValue(parameter) || hasParameterValue(value),
  );
}

// when `preserveDefaultedParameters` is true, we don't remove defaulted parameters with nil values
// so that they can be set in the URL query without a value. Used alongside `getParameterValuesByIdFromQueryParams`
// with `forcefullyUnsetDefaultedParametersWithEmptyStringValue` set to true.
export function getParameterValuesBySlug(
  parameters,
  parameterValuesById,
  { preserveDefaultedParameters } = {},
) {
  parameterValuesById = parameterValuesById || {};
  const parameterValuePairs = parameters.map(parameter => [
    parameter,
    hasParameterValue(parameter.value)
      ? parameter.value
      : parameterValuesById[parameter.id],
  ]);

  const transformedPairs = preserveDefaultedParameters
    ? removeUndefaultedNilValuedPairs(parameterValuePairs)
    : removeNilValuedPairs(parameterValuePairs);

  const slugValuePairs = transformedPairs.map(([parameter, value]) => [
    parameter.slug,
    value,
  ]);

  return Object.fromEntries(slugValuePairs);
}

export function buildHiddenParametersSlugSet(hiddenParameterSlugs) {
  return _.isString(hiddenParameterSlugs)
    ? new Set(hiddenParameterSlugs.split(","))
    : new Set();
}

export function getVisibleParameters(parameters, hiddenParameterSlugs) {
  const hiddenParametersSlugSet = buildHiddenParametersSlugSet(
    hiddenParameterSlugs,
  );

  return parameters.filter(p => !hiddenParametersSlugSet.has(p.slug));
}
