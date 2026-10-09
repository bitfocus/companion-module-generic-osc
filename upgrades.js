// upgrades.js
import { EmptyUpgradeScript, FixupNumericOrVariablesValueToExpressions } from '@companion-module/base';

// Options which were textinputs (to allow variables), and are now number fields
const numericActionOptions = {
	send_int: ['int'],
	send_float: ['float'],
};
const numericFeedbackOptions = {
	osc_feedback_int: ['arguments'],
	osc_feedback_float: ['arguments'],
	osc_feedback_multi_specific: ['index'],
};

function convertNumericFieldsToNumbers(context, props) {
	const result = {
		updatedConfig: null,
		updatedActions: [],
		updatedFeedbacks: [],
	};

	for (const action of props.actions) {
		const keys = numericActionOptions[action.actionId];
		if (!keys) continue;

		for (const key of keys) {
			action.options[key] = FixupNumericOrVariablesValueToExpressions(action.options[key]);
		}
		result.updatedActions.push(action);
	}

	for (const feedback of props.feedbacks) {
		const keys = numericFeedbackOptions[feedback.feedbackId];
		if (!keys) continue;

		for (const key of keys) {
			feedback.options[key] = FixupNumericOrVariablesValueToExpressions(feedback.options[key]);
		}
		result.updatedFeedbacks.push(feedback);
	}

	return result;
}

// osc_feedback_multi_specific used to have separate number and string comparison dropdowns, chosen based on the value
function mergeSpecificComparison(context, props) {
	const result = {
		updatedConfig: null,
		updatedActions: [],
		updatedFeedbacks: [],
	};

	for (const feedback of props.feedbacks) {
		if (feedback.feedbackId !== 'osc_feedback_multi_specific') continue;
		if (feedback.options.comparison) continue;

		const args = feedback.options.arguments;
		const isNumeric =
			args && !args.isExpression && String(args.value).trim() !== '' && Number.isFinite(Number(args.value));

		if (isNumeric) {
			feedback.options.comparison = feedback.options.comparison_number ?? { isExpression: false, value: 'equal' };
		} else {
			const comparison = feedback.options.comparison_string?.value === 'notequal' ? 'notequal' : 'equal';
			feedback.options.comparison = { isExpression: false, value: `${comparison}_string` };
		}

		delete feedback.options.comparison_number;
		delete feedback.options.comparison_string;

		result.updatedFeedbacks.push(feedback);
	}

	return result;
}

export const UpgradeScripts = [
	EmptyUpgradeScript, // was send_multiple_sanitise, for an option which no longer exists
	convertNumericFieldsToNumbers,
	mergeSpecificComparison,
];
