import { Directive } from '@angular/core';
import { BrnComboboxLabel } from '@spartan-ng/brain/combobox';
import { classes } from '@spartan-ng/helm/utils';

@Directive({
	selector: '[hlmComboboxLabel]',
	hostDirectives: [{ directive: BrnComboboxLabel, inputs: ['id'] }],
	host: { 'data-slot': 'combobox-label' },
})
export class HlmComboboxLabel {
	constructor() {
		classes(() => 'text-muted-foreground px-3 py-2.5 text-xs');
	}
}
