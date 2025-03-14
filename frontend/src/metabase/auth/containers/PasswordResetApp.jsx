import React, { Component } from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";
import { Link } from "react-router";
import { t, jt } from "ttag";

import AuthLayout from "metabase/auth/components/AuthLayout";
import Form from "metabase/containers/Form";
import Icon from "metabase/components/Icon";

import MetabaseSettings from "metabase/lib/settings";
import * as MetabaseAnalytics from "metabase/lib/analytics";

import { SessionApi } from "metabase/services";

import Users from "metabase/entities/users";

const mapStateToProps = (state, props) => {
  return {
    token: props.params.token,
    newUserJoining: props.location.hash === "#new",
  };
};

@connect(mapStateToProps)
export default class PasswordResetApp extends Component {
  state = {
    tokenValid: false,
    resetSuccess: false,
  };

  async componentDidMount() {
    try {
      const result = await SessionApi.password_reset_token_valid({
        token: this.props.token,
      });
      if (result && result.valid) {
        this.setState({ tokenValid: true });
      }
    } catch (error) {
      console.log("error validating token", error);
    }
  }

  handleSubmit = async ({ password }) => {
    const { token } = this.props;

    // NOTE: this request will return a Set-Cookie header for the session
    await SessionApi.reset_password({
      token: token,
      password: password,
    });

    MetabaseAnalytics.trackStructEvent("Auth", "Password Reset");
    this.setState({ resetSuccess: true });
  };

  render() {
    const { newUserJoining } = this.props;
    const { resetSuccess } = this.state;

    const passwordComplexity = MetabaseSettings.passwordComplexityDescription();

    const requestLink = (
      <Link to="/auth/forgot_password" className="link">
        {t`request a new reset email`}
      </Link>
    );

    return (
      <AuthLayout>
        {!this.state.tokenValid ? (
          <div>
            <h3>{t`Whoops, that's an expired link`}</h3>
            <p>
              {jt`For security reasons, password reset links expire after a little while. If you still need to reset your password, you can ${requestLink}.`}
            </p>
          </div>
        ) : (
          <div>
            {!resetSuccess ? (
              <div>
                <h3 className="Login-header-offset">{t`New password`}</h3>

                <p className="text-medium mb4">{t`To keep your data secure, passwords ${passwordComplexity}`}</p>
                <Form
                  onSubmit={this.handleSubmit}
                  form={Users.forms.password_reset}
                  submitTitle={t`Save new password`}
                />
              </div>
            ) : (
              <div className="SuccessGroup bg-white bordered rounded shadowed">
                <div className="SuccessMark">
                  <Icon name="check" />
                </div>
                <p>{t`Your password has been reset.`}</p>
                <p>
                  {newUserJoining ? (
                    <Link
                      to="/?new"
                      className="Button Button--primary"
                    >{t`Sign in with your new password`}</Link>
                  ) : (
                    <Link
                      to="/"
                      className="Button Button--primary"
                    >{t`Sign in with your new password`}</Link>
                  )}
                </p>
              </div>
            )}
          </div>
        )}
      </AuthLayout>
    );
  }
}

PasswordResetApp.propTypes = {
  token: PropTypes.string.isRequired,
  newUserJoining: PropTypes.bool.isRequired,
};
