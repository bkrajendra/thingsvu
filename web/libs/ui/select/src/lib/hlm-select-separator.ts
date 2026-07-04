import { Directive } from '@angular/core';
import { BrnSelectSeparator } from '@spartan-ng/brain/select';
import { classes } from '@spartan-ng/helm/utils';

@Directive({
	selector: '[hlmSelectSeparator],hlm-select-separator',
	hostDirectives: [{ directive: BrnSelectSeparator, inputs: ['orientation'] }],
	host: { 'data-slot': 'select-separator' },
})
export class HlmSelectSeparator {
	constructor() {
		classes(() => 'bg-border -mx-1.5 my-1.5 h-px pointer-events-none');
	}
}
