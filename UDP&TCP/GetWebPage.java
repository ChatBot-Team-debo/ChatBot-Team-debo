import java.awt.*;
import java.awt.event.*;
import java.net.*;
import java.io.*;
import javax.swing.*;
import javax.swing.event.*;

public class GetWebPage extends JFrame
						implements ActionListener
{
	private JLabel prompt;	//Cues user to enter a URL.
	private JTextField sourceName;	//Holds URL string.
	private JPanel requestPanel;	//Contains prompt and
									//URL string.
	private JEditorPane contents;	//Holds displayed page.

	public static void main(String[] args)
	{
		GetWebPage frame = new GetWebPage();
		frame.setSize(700,500);
		frame.setVisible(true);

		frame.setDefaultCloseOperation(EXIT_ON_CLOSE);
	}

	public GetWebPage()
	{
		setTitle("Simple Browser");

		requestPanel = new JPanel();
		prompt = new JLabel("Required URL: ");
		sourceName = new JTextField(25);
		sourceName.addActionListener(this);
		requestPanel.add(prompt);
		requestPanel.add(sourceName);
		add(requestPanel, BorderLayout.NORTH);
		contents = new JEditorPane();

		//We don't want the user to be able to alter the
		//contents of the Web page display area, so...
		contents.setEditable(false);

		//Create object that implements HyperlinkListener
		//interface..
		LinkListener linkHandler = new LinkListener();

		//Make the above object a HyperlinkListener for
		//our JEditorPane object...
		contents.addHyperlinkListener(linkHandler);

		//'Wrap' the JEditorPane object inside a
		//JScrollPane, to provide scroll bars...
		add(new JScrollPane(contents),
									BorderLayout.CENTER);
	}

	public void actionPerformed(ActionEvent event)
	//Called when the user presses <Enter>
	//after keying a URL into the text field
	//and also when a hyperlink is clicked.
	{
		showPage(sourceName.getText());
	}

	private class LinkListener
					implements HyperlinkListener
	{
		public void hyperlinkUpdate(HyperlinkEvent event)
		{
			if (event.getEventType() ==
					HyperlinkEvent.EventType.ACTIVATED)
				showPage(event.getURL().toString());
			//Other hyperlink event types ignored.
		}
	}

	private void showPage(String location)
	{
		try
		{
			//Reset page displayed on JEditorPane...
			contents.setPage(location);

			//Reset URL string in text field...
			sourceName.setText(location);
		}
		catch(IOException ioEx)
		{
			JOptionPane.showMessageDialog(this,
							"Unable to retrieve URL",
							"Invalid URL",
							JOptionPane.ERROR_MESSAGE);
		}
	}
}
