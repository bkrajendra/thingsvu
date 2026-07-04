import { Directive } from '@angular/core';
import { BrnNavigationMenuLink } from '@spartan-ng/brain/navigation-menu';
import { classes } from '@spartan-ng/helm/utils';

@Directive({
	selector: 'a[hlmNavigationMenuLink]',
	hostDirectives: [{ directive: BrnNavigationMenuLink, inputs: ['active'] }],
	host: {
		'data-slot': 'navigation-menu-link',
	},
})
export class HlmNavigationMenuLink {
	constructor() {
		classes(() => 'data-[active=true]:focus:bg-muted data-[active=true]:hover:bg-muted data-[active=true]:bg-muted/50 focus-visible:ring-ring/30 hover:bg-muted focus:bg-muted flex items-center gap-1.5 rounded-3xl p-3 text-sm transition-all outline-none focus-visible:ring-3 focus-visible:outline-1 in-data-[slot=navigation-menu-content]:rounded-2xl [&_ng-icon:not([class*=\'text-\'])]:text-[length:--spacing(4)]');
	}
}
