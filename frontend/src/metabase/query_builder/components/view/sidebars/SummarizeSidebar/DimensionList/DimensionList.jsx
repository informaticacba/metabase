import React, { useState } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";

import TextInput from "metabase/components/TextInput";
import Icon from "metabase/components/Icon";
import { useDebouncedValue } from "metabase/hooks/use-debounced-value";
import { SEARCH_DEBOUNCE_DURATION } from "metabase/lib/constants";

import { DimensionListItem } from "./DimensionListItem";
import {
  DimensionListTableName,
  DimensionListFilterContainer,
} from "./DimensionList.styled";
import { filterItems, excludePinnedItems } from "./utils";

const propTypes = {
  queryTableId: PropTypes.number,
  dimension: PropTypes.object,
  dimensions: PropTypes.array,
  sections: PropTypes.array,
  pinnedItems: PropTypes.array,
  onChangeDimension: PropTypes.func.isRequired,
  onAddDimension: PropTypes.func.isRequired,
  onRemoveDimension: PropTypes.func.isRequired,
};

const getItemDimensions = item => {
  return item.dimension?.defaultDimension() || item.dimension;
};

export const DimensionList = ({
  queryTableId,
  dimensions,
  sections,
  onChangeDimension,
  onAddDimension,
  onRemoveDimension,
}) => {
  const isSelected = item =>
    item.dimension &&
    dimensions.some(dimension => item.dimension.isSameBaseDimension(dimension));

  const [filter, setFilter] = useState("");
  const debouncedFilter = useDebouncedValue(filter, SEARCH_DEBOUNCE_DURATION);
  const hasFilter = debouncedFilter.trim().length > 0;

  const [pinnedItems, setPinnedItems] = useState(() => {
    return sections
      .map(section => section.items)
      .flatMap(item => item)
      .filter(item => isSelected(item, dimensions));
  });

  const handleSubDimensionChange = dimension => {
    onChangeDimension(dimension, {
      isSubDimension: true,
    });
  };

  const handleAdd = item => {
    onAddDimension(getItemDimensions(item));
  };

  const handleRemove = item => {
    setPinnedItems(
      pinnedItems.filter(
        pinnedItem => !pinnedItem.dimension.isEqual(item.dimension),
      ),
    );

    onRemoveDimension(getItemDimensions(item));
  };

  const handleChange = item => {
    setPinnedItems([]);
    onChangeDimension(getItemDimensions(item));
  };

  return (
    <>
      <DimensionListFilterContainer>
        <TextInput
          hasClearButton
          placeholder={t`Find...`}
          onChange={setFilter}
          value={filter}
          padding="sm"
          borderRadius="md"
          icon={<Icon name="search" size={16} />}
        />
      </DimensionListFilterContainer>
      {!hasFilter && (
        <ul>
          {pinnedItems.map(item => {
            const shouldIncludeTable =
              item.dimension.field().table.id !== queryTableId;

            return (
              <DimensionListItem
                shouldIncludeTable={shouldIncludeTable}
                dimensions={dimensions}
                onRemoveDimension={handleRemove}
                onSubDimensionChange={handleSubDimensionChange}
                item={item}
                isSelected={isSelected(item)}
                key={item.name}
              />
            );
          })}
        </ul>
      )}
      <ul>
        {sections.map(section => {
          const items = hasFilter
            ? filterItems(section.items, debouncedFilter)
            : excludePinnedItems(section.items, pinnedItems);

          return (
            <li key={section.name}>
              <DimensionListTableName>{section.name}</DimensionListTableName>
              <ul>
                {items.map(item => {
                  return (
                    <DimensionListItem
                      dimensions={dimensions}
                      onChangeDimension={handleChange}
                      onAddDimension={handleAdd}
                      onRemoveDimension={handleRemove}
                      onSubDimensionChange={handleSubDimensionChange}
                      item={item}
                      isSelected={isSelected(item)}
                      key={item.name}
                    />
                  );
                })}
              </ul>
            </li>
          );
        })}
      </ul>
    </>
  );
};

DimensionList.propTypes = propTypes;
