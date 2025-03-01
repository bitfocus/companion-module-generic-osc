// upgrades.js
function send_multiple_sanitise(context, props) {
	const { actions } = props;

	const result = {
		updatedConfig: null,
		updatedActions: [],
		updatedFeedbacks: [],
	}

	if (actions) {
		actions.forEach((action) => {
			if (action.actionId === 'send_multiple') {
				if (action.options && !action.options.sanitise) {
					action.options.sanitise = true;
					console.log(`Upgrade Script: Sanitise option added to send_multiple action ${action.id}.`);
					result.updatedActions.push(action);
				}
			}
		});
	}

	return result;
}

module.exports = [
	send_multiple_sanitise,
]