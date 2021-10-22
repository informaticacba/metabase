import React from "react";
import PropTypes from "prop-types";
import cx from "classnames";

const propTypes = {
  selectedDimension: PropTypes.object,
  dimensions: PropTypes.array,
  onChangeDimension: PropTypes.func.isRequired,
};

export const DimensionPicker = ({
  selectedDimension,
  dimensions,
  onChangeDimension,
}) => {
  return (
    <ul className="px2 py1 scroll-y text-green">
      {dimensions.map((dimension, index) => (
        <li
          key={index}
          className={cx("List-item", {
            "List-item--selected": dimension.isEqual(selectedDimension),
          })}
        >
          <a
            className="List-item-title full px2 py1 cursor-pointer"
            onClick={() => onChangeDimension(dimension)}
          >
            {dimension.subDisplayName()}
          </a>
        </li>
      ))}
    </ul>
  );
};

DimensionPicker.propTypes = propTypes;
