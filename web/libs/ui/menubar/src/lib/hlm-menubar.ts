import { CdkMenuBar } from '@angular/cdk/menu';
import { Directive } from '@angular/core';
import { classes } from '@spartan-ng/helm/utils';

@Directive({
	selector: '[hlmMenubar],hlm-menubar',
	hostDirectives: [CdkMenuBar],
	host: {
		'data-slot': 'menubar',
	},
})
export class HlmMenubar {
	constructor() {
		classes(() => 'h-9 rounded-3xl border p-1 flex items-center');
	}
}
