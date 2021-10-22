import React from "react";
import PropTypes from "prop-types";
import { t } from "ttag";

import Tooltip from "metabase/components/Tooltip";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger";

import Icon from "metabase/components/Icon";

import {
  getSelectedSubDimensionName,
  getItemIcon,
  getItemName,
} from "../utils";
import { DimensionPicker } from "../DimensionPicker/DimensionPicker";
import {
  DimensionListItemRoot,
  DimensionListItemTitle,
  DimensionListItemIcon,
  DimensionListItemContent,
  DimensionListItemTitleContainer,
  DimensionListItemAddButton,
  DimensionListItemRemoveButton,
  DimensionListItemTag,
  SubDimensionButton,
} from "./DimensionListItem.styled";

const noop = () => {};

const propTypes = {
  item: PropTypes.object,
  isSelected: PropTypes.bool,
  shouldIncludeTable: PropTypes.bool,
  onAddDimension: PropTypes.func,
  onRemoveDimension: PropTypes.func,
  onChangeDimension: PropTypes.func,
  onSubDimensionChange: PropTypes.func,
  dimensions: PropTypes.array,
};

export const DimensionListItem = ({
  shouldIncludeTable = false,
  item,
  isSelected,
  dimensions,
  onAddDimension = noop,
  onChangeDimension = noop,
  onRemoveDimension = noop,
  onSubDimensionChange,
}) => {
  const selectedSubDimension = dimensions.find(
    dimension => dimension.field() === item.dimension.field(),
  );

  const tag = item?.dimension.tag;

  const subDimensions =
    item.dimension &&
    !item.dimension.field().isFK() &&
    item.dimension.dimensions();

  const hasSubDimensions = subDimensions && subDimensions.length > 0;

  const selectedSubDimensionName = getSelectedSubDimensionName(
    item.dimension,
    dimensions,
  );

  const handleAdd = () => onAddDimension(item);
  const handleRemove = () => onRemoveDimension(item);
  const handleChange = () => onChangeDimension(item);

  return (
    <DimensionListItemRoot
      data-testid="dimension-list-item"
      isSelected={isSelected}
      aria-selected={isSelected}
    >
      <DimensionListItemContent>
        <DimensionListItemTitleContainer onClick={handleChange}>
          <DimensionListItemIcon name={getItemIcon(item)} size={18} />
          <DimensionListItemTitle data-testid="dimension-list-item-name">
            {getItemName(item, shouldIncludeTable)}
          </DimensionListItemTitle>
        </DimensionListItemTitleContainer>

        {tag && <DimensionListItemTag>{tag}</DimensionListItemTag>}

        {hasSubDimensions && selectedSubDimensionName && (
          <PopoverWithTrigger
            triggerClasses="align-self-stretch"
            triggerElement={
              <SubDimensionButton data-testid="dimension-list-item-binning">
                {selectedSubDimensionName}
              </SubDimensionButton>
            }
            sizeToFit
          >
            {({ onClose }) => (
              <DimensionPicker
                selectedDimension={selectedSubDimension}
                dimensions={subDimensions}
                onChangeDimension={dimension => {
                  onSubDimensionChange(dimension);
                  onClose();
                }}
              />
            )}
          </PopoverWithTrigger>
        )}

        {isSelected && (
          <DimensionListItemRemoveButton aria-label="Remove dimension">
            <Icon name="close" onClick={handleRemove} />
          </DimensionListItemRemoveButton>
        )}
      </DimensionListItemContent>

      {!isSelected && (
        <Tooltip tooltip={t`Add grouping`}>
          <DimensionListItemAddButton
            onClick={handleAdd}
            aria-label="Add dimension"
          >
            <Icon name="add" size={12} />
          </DimensionListItemAddButton>
        </Tooltip>
      )}
    </DimensionListItemRoot>
  );
};

DimensionListItem.propTypes = propTypes;
