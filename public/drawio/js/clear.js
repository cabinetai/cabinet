/**
 * Copyright (c) 2020-2025, JGraph Holdings Ltd
 * Copyright (c) 2020-2025, draw.io AG
 */
try
{
	function write(text)
	{
		document.getElementById('content').appendChild(document.createTextNode(text));
	};

	function writeln(text)
	{
		write(text);
		document.getElementById('content').appendChild(document.createElement('br'));
	};
	
	writeln('');
	write('Clearing Cached version ' + EditorUi.VERSION + '...');

	if (navigator.serviceWorker != null)
	{
		navigator.serviceWorker.getRegistrations().then(function(registrations)
		{
			if (registrations != null && registrations.length > 0)
			{
				for (var i = 0; i < registrations.length; i++)
				{
					registrations[i].unregister();
				}

				writeln('Done');
			}
			else
			{
				writeln('OK');
			}
			
			writeln('');
			var link = document.createElement('button');
			link.style.margin = '4px';
			link.setAttribute('onclick', 'window.location.reload();');
			link.appendChild(document.createTextNode('Update'));
			document.getElementById('content').appendChild(link);

			if ((/test\.draw\.io$/.test(window.location.hostname)) ||
				(/preprod\.diagrams\.net$/.test(window.location.hostname)) ||
				(/app\.diagrams\.net$/.test(window.location.hostname)))
			{
				link = link.cloneNode(false);
				link.setAttribute('onclick', 'window.location.href = "/.";');
				link.appendChild(document.createTextNode('Start App'));
				document.getElementById('content').appendChild(link);
			}
		});
	}
	else
	{
		writeln('OK');
	}

	// Clears corresponding domain of current domain
	var iframe = document.createElement('iframe');
	iframe.style.display = 'none';

	if (window.location.hostname == 'ac.draw.io')
	{
		iframe.src = 'https://clear.diagrams.net';
	}
	else
	{
		iframe.src = 'https://clear.draw.io';
	}

	document.body.appendChild(iframe);
}
catch (e)
{
	write('Error: ' + e.message);
}
