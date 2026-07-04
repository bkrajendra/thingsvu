import { Directive } from '@angular/core';
import { BrnAutocompleteLabel } from '@spartan-ng/brain/autocomplete';
import { classes } from '@spartan-ng/helm/utils';

@Directive({
	selector: '[hlmAutocompleteLabel]',
	hostDirectives: [{ directive: BrnAutocompleteLabel, inputs: ['id'] }],
	host: { 'data-slot': 'autocomplete-label' },
})
export class HlmAutocompleteLabel {
	constructor() {
		classes(() => 'text-muted-foreground px-3 py-2.5 text-xs');
	}
}
