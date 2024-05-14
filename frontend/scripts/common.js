export const UI_POSITIONS = Object.freeze({
    TOP: 0,
    BOTTOM: 1,
    LEFT: 2,
    RIGHT: 3
});

/*  placeUI
    Places the side and width bars on the right or left, and top or bottom respectively.
    Parameters can be changed to accomodate for handedness of participant.

    Inputs:
        rightleft: UI_POSITIONS
            Determines if the sidebar will be on the right or left side of the screen.
        topbottom: UI_POSITIONS
            Determines if the widthbar will be on the top or bottom of the screen.

    Outputs:
        boolean
            True if function is successful, false if failed
*/
export function placeUI(rightleft, topbottom) {
    var sidebars = document.getElementsByClassName("sidebar");
    var widthbars = document.getElementsByClassName("widthbar");

    sidebarWidth = getComputedStyle(document.body).getPropertyValue("--sideWidth");

    switch(rightleft) {
        case UI_POSITIONS.RIGHT:
            sidebars[0].style.right = "0px";
            widthbars[0].style.right = sidebarWidth;
            break;
        case UI_POSITIONS.LEFT:
            sidebars[0].style.left = "0px";
            widthbars[0].style.left = sidebarWidth;
            break;
        default:
            console.error("Receieved an invalid position for sidebar");
            return false;
    }

    switch(topbottom) {
        case UI_POSITIONS.TOP:
            widthbars[0].style.top = "0px";
            break;
        case UI_POSITIONS.BOTTOM:
            widthbars[0].style.bottom = "0px";
            break;
        default:
            console.error("Receieved an invalid position for widthbar");
            return false;
    }

    return true;
}