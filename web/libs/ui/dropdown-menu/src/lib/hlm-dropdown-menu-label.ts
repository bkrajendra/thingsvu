import { type BooleanInput } from '@angular/cdk/coercion';
import { booleanAttribute, Directive, input } from '@angular/core';
import { classes } from '@spartan-ng/helm/utils';

@Directive({
	selector: '[hlmDropdownMenuLabel],hlm-dropdown-menu-label',
	host: {
		'data-slot': 'dropdown-menu-label',
		'[attr.data-inset]': 'inset() ? "" : null',
	},
})
export class HlmDropdownMenuLabel {
	public readonly inset = input<boolean, BooleanInput>(false, {
		transform: booleanAttribute,
	});

	constructor() {
		classes(() => 'text-muted-foreground px-3 py-2.5 text-xs data-inset:ps-9.5 block');
	}
}
