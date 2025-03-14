/* eslint "react/prop-types": "warn" */
import React, { Component } from "react";
import PropTypes from "prop-types";
import { Flex, Box } from "grid-styled";
import { t } from "ttag";
import * as MetabaseAnalytics from "metabase/lib/analytics";

import User from "metabase/entities/users";

import StepTitle from "./StepTitle";
import CollapsedStep from "./CollapsedStep";

import _ from "underscore";

export default class UserStep extends Component {
  static propTypes = {
    stepNumber: PropTypes.number.isRequired,
    activeStep: PropTypes.number.isRequired,
    setActiveStep: PropTypes.func.isRequired,

    userDetails: PropTypes.object,
    defaultUserDetails: PropTypes.object,
    setUserDetails: PropTypes.func.isRequired,
    validatePassword: PropTypes.func.isRequired,
  };

  handleAsyncValidate = async values => {
    try {
      await this.props.validatePassword(values.password);
      return {};
    } catch (error) {
      MetabaseAnalytics.trackStructEvent(
        "Setup",
        "Error",
        "password validation",
      );
      return error.data.errors;
    }
  };

  handleSubmit = values => {
    this.props.setUserDetails({
      nextStep: this.props.stepNumber + 1,
      details: _.omit(values, "password_confirm"),
    });

    MetabaseAnalytics.trackStructEvent("Setup", "User Details Step");
  };

  render() {
    const {
      activeStep,
      setActiveStep,
      stepNumber,
      userDetails,
      defaultUserDetails,
    } = this.props;

    const stepText =
      activeStep <= stepNumber
        ? t`What should we call you?`
        : t`Hi, ${userDetails.first_name}. Nice to meet you!`;

    if (activeStep !== stepNumber) {
      return (
        <CollapsedStep
          stepNumber={stepNumber}
          stepCircleText={String(stepNumber)}
          stepText={stepText}
          isCompleted={activeStep > stepNumber}
          setActiveStep={setActiveStep}
        />
      );
    } else {
      return (
        <Box
          p={4}
          className="SetupStep SetupStep--active rounded bg-white full relative"
        >
          <StepTitle title={stepText} circleText={String(stepNumber)} />
          {defaultUserDetails && (
            <div className="Form-field">
              {t`We know you’ve already created one of these. We like to keep billing and product accounts separate so that you don’t have to share logins.`}
            </div>
          )}
          <User.Form
            className="mt1"
            form={User.forms.setup()}
            user={{
              ...defaultUserDetails,
              ...userDetails,
              password_confirm: userDetails?.password,
            }}
            onSubmit={this.handleSubmit}
            asyncValidate={this.handleAsyncValidate}
            asyncBlurFields={["password"]}
          >
            {({ Form, FormField, FormFooter }) => (
              <Form>
                <Flex align="center">
                  <FormField name="first_name" className="flex-full mr1" />
                  <FormField name="last_name" className="flex-full" />
                </Flex>
                <FormField name="email" />
                <FormField name="site_name" />
                <FormField name="password" />
                <FormField name="password_confirm" />
                <FormFooter submitTitle={t`Next`} />
              </Form>
            )}
          </User.Form>
        </Box>
      );
    }
  }
}
