// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {intlShape} from 'react-intl';

import {IntegrationTypes} from '@mm-redux/action_types';
import {executeCommand as executeCommandService} from '@mm-redux/actions/integrations';
import {getCurrentTeamId} from '@mm-redux/selectors/entities/teams';
import {AppCallResponseTypes, AppCallTypes} from '@mm-redux/constants/apps';
import {DispatchFunc, GetStateFunc, ActionFunc} from '@mm-redux/types/actions';

import {AppCommandParser} from '@components/autocomplete/slash_suggestion/app_command_parser/app_command_parser';

import {doAppCall} from '@actions/apps';
import {appsEnabled} from '@utils/apps';
import {AppCallResponse} from '@mm-redux/types/apps';
import {sendEphemeralPost} from './post';

export function executeCommand(message: string, channelId: string, rootId: string, intl: typeof intlShape): ActionFunc {
    return async (dispatch: DispatchFunc, getState: GetStateFunc) => {
        const state = getState();

        const teamId = getCurrentTeamId(state);

        const args = {
            channel_id: channelId,
            team_id: teamId,
            root_id: rootId,
            parent_id: rootId,
        };

        let msg = message;

        let cmdLength = msg.indexOf(' ');
        if (cmdLength < 0) {
            cmdLength = msg.length;
        }

        const cmd = msg.substring(0, cmdLength).toLowerCase();
        msg = cmd + msg.substring(cmdLength, msg.length);

        const appsAreEnabled = appsEnabled(state);
        if (appsAreEnabled) {
            const parser = new AppCommandParser({dispatch, getState}, intl, args.channel_id, args.root_id);
            if (parser.isAppCommand(msg)) {
                const {call, errorMessage} = await parser.composeCallFromCommand(message);
                const createErrorMessage = (errMessage: string) => {
                    return {error: {message: errMessage}};
                };

                if (!call) {
                    return createErrorMessage(errorMessage!);
                }

                const res = await dispatch(doAppCall(call, AppCallTypes.SUBMIT, intl));
                if (res.error) {
                    const errorResponse = res.error as AppCallResponse;
                    return createErrorMessage(errorResponse.error || intl.formatMessage({
                        id: 'apps.error.unknown',
                        defaultMessage: 'Unknown error.',
                    }));
                }
                const callResp = res.data as AppCallResponse;
                switch (callResp.type) {
                case AppCallResponseTypes.OK:
                    if (callResp.markdown) {
                        dispatch(sendEphemeralPost(callResp.markdown, args.channel_id, args.parent_id));
                    }
                    return {data: {}};
                case AppCallResponseTypes.FORM:
                case AppCallResponseTypes.NAVIGATE:
                    return {data: {}};
                default:
                    return createErrorMessage(intl.formatMessage({
                        id: 'apps.error.responses.unknown_type',
                        defaultMessage: 'App response type not supported. Response type: {type}.',
                    }, {
                        type: callResp.type,
                    }));
                }
            }
        }

        const {data, error} = await dispatch(executeCommandService(msg, args));

        if (data?.trigger_id) { //eslint-disable-line camelcase
            dispatch({type: IntegrationTypes.RECEIVED_DIALOG_TRIGGER_ID, data: data.trigger_id});
        }

        return {data, error};
    };
}
