import { Directive } from '@angular/core';
import { BrnCommandSeparator } from '@spartan-ng/brain/command';
import { classes } from '@spartan-ng/helm/utils';

@Directive({
	selector: '[hlmCommandSeparator],hlm-command-separator',
	hostDirectives: [BrnCommandSeparator],
	host: {
		'data-slot': 'command-separator',
	},
})
export class HlmCommandSeparator {
	constructor() {
		classes(() => 'bg-border/50 my-1.5 h-px block data-hidden:hidden');
	}
}
