import _ from "underscore";

import MetabaseSettings from "metabase/lib/settings";
import {
  PARAMETER_OPERATOR_TYPES,
  getParameterOptions,
  getOperatorDisplayName,
  dimensionFilterForParameter,
  getTagOperatorFilterForParameter,
  getParameterTargetField,
  dateParameterValueToMBQL,
  stringParameterValueToMBQL,
  numberParameterValueToMBQL,
  parameterToMBQLFilter,
  parameterOptionsForField,
  deriveFieldOperatorFromParameter,
  getTemplateTagParameters,
  buildHiddenParametersSlugSet,
  getVisibleParameters,
} from "metabase/meta/Parameter";
import {
  metadata,
  PRODUCTS,
  SAMPLE_DATASET,
} from "__support__/sample_dataset_fixture";

MetabaseSettings.get = jest.fn();

function mockFieldFilterOperatorsFlag(value) {
  MetabaseSettings.get.mockImplementation(flag => {
    if (flag === "field-filter-operators-enabled?") {
      return value;
    }
  });
}

describe("metabase/meta/Parameter", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    MetabaseSettings.get.mockReturnValue(false);
  });

  describe("getParameterOptions", () => {
    describe("when `field-filter-operators-enabled?` is false", () => {
      beforeEach(() => {
        mockFieldFilterOperatorsFlag(false);
      });

      it("should return options without operator subtypes (except for date parameters)", () => {
        const options = new Set(_.map(getParameterOptions(), "type"));
        const expectedOptionTypes = [
          "id",
          "category",
          "location/city",
          "location/state",
          "location/zip_code",
          "location/country",
        ].concat(_.map(PARAMETER_OPERATOR_TYPES.date, "type"));

        expect(expectedOptionTypes.length).toEqual(options.size);
        expect(expectedOptionTypes.every(option => options.has(option))).toBe(
          true,
        );
      });
    });

    describe("when `field-filter-operators-enabled?` is true", () => {
      beforeEach(() => {
        mockFieldFilterOperatorsFlag(true);
      });

      it("should return options with operator subtypes", () => {
        const options = new Set(_.map(getParameterOptions(), "type"));
        const expectedOptionTypes = ["id"].concat(
          _.map(PARAMETER_OPERATOR_TYPES.number, "type"),
          _.map(PARAMETER_OPERATOR_TYPES.string, "type"),
          _.map(PARAMETER_OPERATOR_TYPES.date, "type"),
        );

        expect(expectedOptionTypes.length).toEqual(options.size);
        expect(expectedOptionTypes.every(option => options.has(option))).toBe(
          true,
        );
      });

      it("should add a `combinedName` property to options", () => {
        const optionsByType = _.indexBy(getParameterOptions(), "type");

        expect(optionsByType["string/="].combinedName).toEqual("String");
        expect(optionsByType["string/!="].combinedName).toEqual(
          "String is not",
        );
        expect(optionsByType["number/!="].combinedName).toEqual("Not equal to");
        expect(optionsByType["date/single"].combinedName).toEqual(
          "Single Date",
        );
      });
    });
  });

  describe("getOperatorDisplayName", () => {
    it("should return an option's name when the operator is a date or a number", () => {
      expect(getOperatorDisplayName({ name: "foo" }, "date")).toEqual("foo");
      expect(getOperatorDisplayName({ name: "foo" }, "number")).toEqual("foo");
    });

    it("should return an option's section name for the string/= option", () => {
      expect(
        getOperatorDisplayName({ name: "foo", operator: "=" }, "string", "bar"),
      ).toEqual("bar");
    });

    it("should otherwise return a combined sectionName + option name", () => {
      expect(
        getOperatorDisplayName(
          { name: "Foo", operator: "!=" },
          "string",
          "Bar",
        ),
      ).toEqual("Bar foo");
    });
  });

  describe("dateParameterValueToMBQL", () => {
    it("should parse past30days", () => {
      expect(dateParameterValueToMBQL("past30days", null)).toEqual([
        "time-interval",
        null,
        -30,
        "day",
      ]);
    });
    it("should parse past30days~", () => {
      expect(dateParameterValueToMBQL("past30days~", null)).toEqual([
        "time-interval",
        null,
        -30,
        "day",
        { "include-current": true },
      ]);
    });
    it("should parse next2years", () => {
      expect(dateParameterValueToMBQL("next2years", null)).toEqual([
        "time-interval",
        null,
        2,
        "year",
      ]);
    });
    it("should parse next2years~", () => {
      expect(dateParameterValueToMBQL("next2years~", null)).toEqual([
        "time-interval",
        null,
        2,
        "year",
        { "include-current": true },
      ]);
    });
    it("should parse thisday", () => {
      expect(dateParameterValueToMBQL("thisday", null)).toEqual([
        "time-interval",
        null,
        "current",
        "day",
      ]);
    });
    it("should parse ~2017-05-01", () => {
      expect(dateParameterValueToMBQL("~2017-05-01", null)).toEqual([
        "<",
        null,
        "2017-05-01",
      ]);
    });
    it("should parse 2017-05-01~", () => {
      expect(dateParameterValueToMBQL("2017-05-01~", null)).toEqual([
        ">",
        null,
        "2017-05-01",
      ]);
    });
    it("should parse 2017-05", () => {
      expect(dateParameterValueToMBQL("2017-05", null)).toEqual([
        "=",
        ["field", null, { "temporal-unit": "month" }],
        "2017-05-01",
      ]);
    });
    it("should parse Q1-2017", () => {
      expect(dateParameterValueToMBQL("Q1-2017", null)).toEqual([
        "=",
        ["field", null, { "temporal-unit": "quarter" }],
        "2017-01-01",
      ]);
    });
    it("should parse 2017-05-01", () => {
      expect(dateParameterValueToMBQL("2017-05-01", null)).toEqual([
        "=",
        null,
        "2017-05-01",
      ]);
    });
    it("should parse 2017-05-01~2017-05-02", () => {
      expect(dateParameterValueToMBQL("2017-05-01~2017-05-02", null)).toEqual([
        "between",
        null,
        "2017-05-01",
        "2017-05-02",
      ]);
    });
  });

  describe("stringParameterValueToMBQL", () => {
    describe("when given an array parameter value", () => {
      it("should flatten the array parameter values", () => {
        expect(
          stringParameterValueToMBQL(
            { type: "category/=", value: ["1", "2"] },
            null,
          ),
        ).toEqual(["=", null, "1", "2"]);
      });
    });

    describe("when given a string parameter value", () => {
      it("should return the correct MBQL", () => {
        expect(
          stringParameterValueToMBQL(
            { type: "category/starts-with", value: "1" },
            null,
          ),
        ).toEqual(["starts-with", null, "1"]);
      });
    });

    it("should default the operator to `=`", () => {
      expect(
        stringParameterValueToMBQL(
          { type: "category", value: ["1", "2"] },
          null,
        ),
      ).toEqual(["=", null, "1", "2"]);

      expect(
        stringParameterValueToMBQL(
          { type: "location/city", value: ["1", "2"] },
          null,
        ),
      ).toEqual(["=", null, "1", "2"]);
    });
  });

  describe("numberParameterValueToMBQL", () => {
    describe("when given an array parameter value", () => {
      it("should flatten the array parameter values", () => {
        expect(
          numberParameterValueToMBQL(
            { type: "number/between", value: [1, 2] },
            null,
          ),
        ).toEqual(["between", null, 1, 2]);
      });
    });

    describe("when given a string parameter value", () => {
      it("should parse the parameter value as a float", () => {
        expect(
          numberParameterValueToMBQL({ type: "number/=", value: "1.1" }, null),
        ).toEqual(["=", null, 1.1]);
      });
    });
  });

  describe("parameterToMBQLFilter", () => {
    it("should return null for parameter targets that are not field dimension targets", () => {
      expect(
        parameterToMBQLFilter({
          target: null,
          type: "category",
          value: ["foo"],
        }),
      ).toBe(null);

      expect(
        parameterToMBQLFilter({ target: [], type: "category", value: ["foo"] }),
      ).toBe(null);

      expect(
        parameterToMBQLFilter({
          target: ["dimension"],
          type: "category",
          value: ["foo"],
        }),
      ).toBe(null);

      expect(
        parameterToMBQLFilter({
          target: ["dimension", ["template-tag", "foo"]],
          type: "category",
          value: ["foo"],
        }),
      ).toBe(null);
    });

    it("should return mbql filter for date parameter", () => {
      expect(
        parameterToMBQLFilter(
          {
            target: ["dimension", ["field", PRODUCTS.CREATED_AT.id, null]],
            type: "date/single",
            value: "01-01-2020",
          },
          metadata,
        ),
      ).toEqual(["=", ["field", PRODUCTS.CREATED_AT.id, null], "01-01-2020"]);
    });

    it("should return mbql filter for string parameter", () => {
      expect(
        parameterToMBQLFilter(
          {
            target: ["dimension", ["field", PRODUCTS.CATEGORY.id, null]],
            type: "string/starts-with",
            value: "foo",
          },
          metadata,
        ),
      ).toEqual(["starts-with", ["field", PRODUCTS.CATEGORY.id, null], "foo"]);

      expect(
        parameterToMBQLFilter(
          {
            target: ["dimension", ["field", PRODUCTS.CATEGORY.id, null]],
            type: "string/starts-with",
            value: ["foo"],
          },
          metadata,
        ),
      ).toEqual(["starts-with", ["field", PRODUCTS.CATEGORY.id, null], "foo"]);
    });

    it("should return mbql filter for category parameter", () => {
      expect(
        parameterToMBQLFilter(
          {
            target: ["dimension", ["field", PRODUCTS.CATEGORY.id, null]],
            type: "category",
            value: ["foo", "bar"],
          },
          metadata,
        ),
      ).toEqual(["=", ["field", PRODUCTS.CATEGORY.id, null], "foo", "bar"]);
    });

    it("should return mbql filter for number parameter", () => {
      expect(
        parameterToMBQLFilter(
          {
            target: ["dimension", ["field", PRODUCTS.RATING.id, null]],
            type: "number/=",
            value: [111],
          },
          metadata,
        ),
      ).toEqual(["=", ["field", PRODUCTS.RATING.id, null], 111]);

      expect(
        parameterToMBQLFilter(
          {
            target: ["dimension", ["field", PRODUCTS.RATING.id, null]],
            type: "number/=",
            value: 111,
          },
          metadata,
        ),
      ).toEqual(["=", ["field", PRODUCTS.RATING.id, null], 111]);

      expect(
        parameterToMBQLFilter(
          {
            target: ["dimension", ["field", PRODUCTS.RATING.id, null]],
            type: "number/between",
            value: [1, 100],
          },
          metadata,
        ),
      ).toEqual(["between", ["field", PRODUCTS.RATING.id, null], 1, 100]);
    });
  });

  describe("parameterOptionsForField", () => {
    const field = {
      isDate: () => false,
      isID: () => false,
      isCategory: () => false,
      isCity: () => false,
      isState: () => false,
      isZipCode: () => false,
      isCountry: () => false,
      isNumber: () => false,
      isString: () => false,
      isLocation: () => false,
    };
    it("should return relevantly typed options for date field", () => {
      const dateField = {
        ...field,
        isDate: () => true,
      };
      const availableOptions = parameterOptionsForField(dateField);
      expect(
        availableOptions.length > 0 &&
          availableOptions.every(option => option.type.startsWith("date")),
      ).toBe(true);
    });

    it("should return relevantly typed options for id field", () => {
      const idField = {
        ...field,
        isID: () => true,
      };
      const availableOptions = parameterOptionsForField(idField);
      expect(
        availableOptions.length > 0 &&
          availableOptions.every(option => option.type.startsWith("id")),
      ).toBe(true);
    });

    it("should return the specific location/state option for a state field", () => {
      const stateField = {
        ...field,
        isState: () => true,
      };
      const availableOptions = parameterOptionsForField(stateField);
      expect(availableOptions).toEqual([
        expect.objectContaining({ type: "location/state" }),
      ]);
    });

    it("as a result of all location parameters haiving subtypes should return nothing for a generic location field", () => {
      const locationField = { ...field, isLocation: () => true };
      const availableOptions = parameterOptionsForField(locationField);
      expect(availableOptions).toEqual([]);
    });
  });

  describe("dimensionFilterForParameter", () => {
    const field = {
      isDate: () => false,
      isID: () => false,
      isCategory: () => false,
      isCity: () => false,
      isState: () => false,
      isZipCode: () => false,
      isCountry: () => false,
      isNumber: () => false,
      isString: () => false,
      isLocation: () => false,
    };
    const typelessDimension = {
      field: () => field,
    };

    [
      [
        { type: "date/single" },
        {
          type: "date",
          field: () => ({ ...field, isDate: () => true }),
        },
      ],
      [
        { type: "id" },
        {
          type: "id",
          field: () => ({ ...field, isID: () => true }),
        },
      ],
      [
        { type: "category" },
        {
          type: "category",
          field: () => ({ ...field, isCategory: () => true }),
        },
      ],
      [
        { type: "location/city" },
        {
          type: "city",
          field: () => ({ ...field, isCity: () => true }),
        },
      ],
      [
        { type: "number/!=" },
        {
          type: "number",
          field: () => ({
            ...field,
            isNumber: () => true,
            isCoordinate: () => false,
          }),
        },
      ],
      [
        { type: "string/=" },
        {
          type: "category",
          field: () => ({
            ...field,
            isCategory: () => true,
          }),
        },
      ],
      [
        { type: "string/!=" },
        {
          type: "category",
          field: () => ({
            ...field,
            isCategory: () => true,
          }),
        },
      ],
      [
        { type: "string/starts-with" },
        {
          type: "string",
          field: () => ({
            ...field,
            isString: () => true,
          }),
        },
      ],
    ].forEach(([parameter, dimension]) => {
      it(`should return a predicate that evaluates to true for a ${dimension.type} dimension when given a ${parameter.type} parameter`, () => {
        const predicate = dimensionFilterForParameter(parameter);
        expect(predicate(typelessDimension)).toBe(false);
        expect(predicate(dimension)).toBe(true);
      });
    });

    it("should return a predicate that evaluates to false for a coordinate dimension when given a number parameter", () => {
      const coordinateDimension = {
        field: () => ({
          ...field,
          isNumber: () => true,
          isCoordinate: () => true,
        }),
      };

      const predicate = dimensionFilterForParameter({ type: "number/between" });
      expect(predicate(coordinateDimension)).toBe(false);
    });

    it("should return a predicate that evaluates to false for a location dimension when given a category parameter", () => {
      const locationDimension = {
        field: () => ({
          ...field,
          isLocation: () => true,
        }),
      };

      const predicate = dimensionFilterForParameter({ type: "category" });
      expect(predicate(locationDimension)).toBe(false);
    });
  });

  describe("getTagOperatorFilterForParameter", () => {
    it("should return a predicate that evaluates to true for a template tag that has the same subtype operator as the given parameter", () => {
      const predicate = getTagOperatorFilterForParameter({
        type: "string/starts-with",
      });
      const templateTag1 = {
        "widget-type": "string/starts-with",
      };
      const templateTag2 = {
        "widget-type": "foo/starts-with",
      };
      const templateTag3 = {
        "widget-type": "string/ends-with",
      };
      expect(predicate(templateTag1)).toBe(true);
      expect(predicate(templateTag2)).toBe(true);
      expect(predicate(templateTag3)).toBe(false);
    });
  });

  describe("getParameterTargetField", () => {
    it("should return null when the target is not a dimension", () => {
      expect(getParameterTargetField(["variable", "foo"], metadata)).toBe(null);
    });

    it("should return the mapped field behind a template tag field filter", () => {
      const target = ["dimension", ["template-tag", "foo"]];
      const question = SAMPLE_DATASET.nativeQuestion({
        query: "select * from PRODUCTS where {{foo}}",
        "template-tags": {
          foo: {
            type: "dimension",
            dimension: ["field", PRODUCTS.CATEGORY.id, null],
          },
        },
      });

      expect(getParameterTargetField(target, metadata, question)).toBe(
        PRODUCTS.CATEGORY,
      );
    });

    it("should return the target field", () => {
      const target = ["dimension", ["field", PRODUCTS.CATEGORY.id, null]];
      const question = SAMPLE_DATASET.question({
        "source-table": PRODUCTS.id,
      });
      expect(getParameterTargetField(target, metadata, question)).toBe(
        PRODUCTS.CATEGORY,
      );
    });
  });

  describe("deriveFieldOperatorFromParameter", () => {
    describe("when parameter is associated with an operator", () => {
      it("should return relevant operator object", () => {
        const operator2 = deriveFieldOperatorFromParameter({
          type: "string/contains",
        });
        const operator3 = deriveFieldOperatorFromParameter({
          type: "number/between",
        });
        expect(operator2.name).toEqual("contains");
        expect(operator3.name).toEqual("between");
      });
    });

    describe("when parameter is location/category", () => {
      it("should map to an = operator", () => {
        expect(
          deriveFieldOperatorFromParameter({
            type: "location/city",
          }).name,
        ).toBe("=");

        expect(
          deriveFieldOperatorFromParameter({
            type: "category",
          }).name,
        ).toBe("=");
      });
    });

    describe("when parameter is NOT associated with an operator", () => {
      it("should return undefined", () => {
        expect(deriveFieldOperatorFromParameter({ type: "date/single" })).toBe(
          undefined,
        );
      });
    });
  });

  describe("getTemplateTagParameters", () => {
    let tags;
    beforeEach(() => {
      tags = [
        {
          "widget-type": "foo",
          type: "string",
          id: 1,
          name: "a",
          "display-name": "A",
          default: "abc",
        },
        {
          type: "string",
          id: 2,
          name: "b",
          "display-name": "B",
        },
        {
          type: "number",
          id: 3,
          name: "c",
          "display-name": "C",
        },
        {
          type: "date",
          id: 4,
          name: "d",
          "display-name": "D",
        },
        {
          "widget-type": "foo",
          type: "dimension",
          id: 5,
          name: "e",
          "display-name": "E",
        },
        {
          type: null,
          id: 6,
        },
        {
          type: "dimension",
          id: 7,
          name: "f",
          "display-name": "F",
        },
      ];
    });

    describe("field filter operators enabled", () => {
      beforeEach(() => {
        mockFieldFilterOperatorsFlag(true);
      });

      it("should convert tags into tag parameters with field filter operator types", () => {
        const parametersWithFieldFilterOperatorTypes = [
          {
            default: "abc",
            id: 1,
            name: "A",
            slug: "a",
            target: ["variable", ["template-tag", "a"]],
            type: "foo",
          },
          {
            default: undefined,
            id: 2,
            name: "B",
            slug: "b",
            target: ["variable", ["template-tag", "b"]],
            type: "string/=",
          },
          {
            default: undefined,
            id: 3,
            name: "C",
            slug: "c",
            target: ["variable", ["template-tag", "c"]],
            type: "number/=",
          },
          {
            default: undefined,
            id: 4,
            name: "D",
            slug: "d",
            target: ["variable", ["template-tag", "d"]],
            type: "date/single",
          },
          {
            default: undefined,
            id: 5,
            name: "E",
            slug: "e",
            target: ["dimension", ["template-tag", "e"]],
            type: "foo",
          },
        ];

        expect(getTemplateTagParameters(tags)).toEqual(
          parametersWithFieldFilterOperatorTypes,
        );
      });
    });

    describe("field filter operators disabled", () => {
      it("should convert tags into tag parameters", () => {
        const parameters = [
          {
            default: "abc",
            id: 1,
            name: "A",
            slug: "a",
            target: ["variable", ["template-tag", "a"]],
            type: "foo",
          },
          {
            default: undefined,
            id: 2,
            name: "B",
            slug: "b",
            target: ["variable", ["template-tag", "b"]],
            type: "category",
          },
          {
            default: undefined,
            id: 3,
            name: "C",
            slug: "c",
            target: ["variable", ["template-tag", "c"]],
            type: "category",
          },
          {
            default: undefined,
            id: 4,
            name: "D",
            slug: "d",
            target: ["variable", ["template-tag", "d"]],
            type: "date/single",
          },
          {
            default: undefined,
            id: 5,
            name: "E",
            slug: "e",
            target: ["dimension", ["template-tag", "e"]],
            type: "foo",
          },
        ];
        expect(getTemplateTagParameters(tags)).toEqual(parameters);
      });
    });
  });

  describe("buildHiddenParametersSlugSet", () => {
    it("should turn the given string of slugs separated by commas into a set of slug strings", () => {
      expect(buildHiddenParametersSlugSet("a,b,c")).toEqual(
        new Set(["a", "b", "c"]),
      );
    });

    it("should return an empty set for any input that is not a string", () => {
      expect(buildHiddenParametersSlugSet(undefined)).toEqual(new Set());
      expect(buildHiddenParametersSlugSet(111111)).toEqual(new Set());
    });
  });

  describe("getVisibleParameters", () => {
    const parameters = [
      {
        id: 1,
        slug: "foo",
      },
      {
        id: 2,
        slug: "bar",
      },
      {
        id: 3,
        slug: "baz",
      },
      {
        id: 4,
        slug: "qux",
      },
    ];

    const hiddenParameterSlugs = "bar,baz";

    it("should return the parameters that are not hidden", () => {
      expect(getVisibleParameters(parameters, hiddenParameterSlugs)).toEqual([
        {
          id: 1,
          slug: "foo",
        },
        {
          id: 4,
          slug: "qux",
        },
      ]);
    });
  });
});
